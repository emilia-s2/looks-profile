'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const root = path.join(__dirname, '..');
const cache = require('./preview-cache')(root);
const reportFile = path.join(root, 'ui-test-report.json');
const resource = path.join(root, 'resources', 'creator-profile.gpk.gz');
const baselineHash = 'ba7f68388490e2649b5383e73cfd3d55c4d5979a4eac9c0ba59f8ed14a27f45d';
const catalog = require('./catalog');
const Locale = require('./i18n');
const PortraitPackage = require('./portrait-package');
const sourceHash = 'b06b5a4b37f890d18d4b3d936d5850e03fc1fb483c479b5c301963a23b64c2ef';
function readSmall(file) {
  if (!fs.existsSync(file)) return null;
  if (fs.statSync(file).size > 16384) throw Error('Arquivo de controle excede o limite.');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Small bounded history links later crashes to the exact client PID/profile.
// Logging failure must never interrupt an otherwise successful installation.
function history(value) {
  try {
    const file = path.join(root, 'activation-history.jsonl');
    const previous = fs.existsSync(file) && fs.statSync(file).size <= 65536 ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean) : [];
    const line = JSON.stringify(value);
    if (line.length > 1800) return;
    fs.writeFileSync(file, previous.slice(-31).concat(line).join('\n') + '\n');
  } catch (_) {}
}

function write(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
  if (file === reportFile) history(value);
}

function clientRoot(info) {
  if (!info || typeof info.path !== 'string' || !path.isAbsolute(info.path))
    throw Error('O Toolbox não informou a pasta do cliente.');
  // Same layout used by tera-client-interface/GPKManager: info.path is Binaries.
  return fs.realpathSync(path.resolve(info.path, '..'));
}

function samePath(a, b) { return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase(); }
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function readResource() {
  if (!fs.existsSync(resource) || fs.statSync(resource).size !== 1478604)
    throw Error('O pacote compactado nao corresponde ao arquivo verificado.');
  const compressed = fs.readFileSync(resource);
  if (hash(compressed) !== 'af487214d5f3beba29854798fd344e021cbd05752e97a721d81f40d1d010bc03')
    throw Error('O pacote compactado foi alterado.');
  const bytes = zlib.gunzipSync(compressed);
  if (bytes.length !== 7963085 || hash(bytes) !== baselineHash)
    throw Error('O pacote descompactado nao corresponde a interface verificada.');
  return bytes;
}

function validateClient(info, gameRoot) {
  if (info.arch !== 'x64' || info.majorPatchVersion !== 100 || info.minorPatchVersion !== 2)
    throw Error('Este teste exige o cliente x64 100.2 que foi analisado.');
  const baseline = readResource();
  // Read only: confirm the precise original resource this baseline was built from.
  // Another 100.2 build must not be accepted just because its patch number matches.
  const file = path.join(gameRoot, 'S1Game', 'CookedPC', 'c7a706fb_155.gpk');
  const offset = 65863765, length = 1913244;
  const fd = fs.openSync(file, 'r');
  try {
    if (fs.fstatSync(fd).size < offset + length) throw Error('Contêiner de interface incompatível.');
    const bytes = Buffer.alloc(length);
    let total = 0;
    while (total < length) {
      const read = fs.readSync(fd, bytes, total, length - total, offset + total);
      if (!read) throw Error('Leitura incompleta do recurso original.');
      total += read;
    }
    if (hash(bytes) !== sourceHash) throw Error('A interface deste cliente difere da versão analisada.');
  } finally { fs.closeSync(fd); }
  return baseline;
}

function describe(mod) {
  const t = (text, params) => Locale.t(Locale.resolve(mod), text, params);
  const report = readSmall(reportFile);
  const info = mod.clientInterface && mod.clientInterface.info;
  const current = report && info && report.pid === info.pid && samePath(report.gameRoot, clientRoot(info));
  if (!current) return t('Catálogo disponível na próxima abertura do TERA. Nenhuma aplicação automática.');
  if (report.state === 'registered') {
    if (report.profileId) return t('Esta abertura ainda usa uma interface antiga. Reabra o TERA para retirar a aplicação automática.');
    return t('Catálogo registrado: {count} perfis. Nenhuma aplicação automática. Escolha em Customize → Presets.', {count: report.catalogCount});
  }
  if (report.installAttempted) return t('Falha no registro: {error}. Reabra somente o TERA antes de tentar novamente.', {error: report.error});
  return t('Catálogo não instalado: {error}.', {error: report.error || report.state});
}

class ClientMod {
  constructor(mod) {
    this.mod = mod;
    require('./preferences').clean(mod, root);
    try { cache.resume(); } catch (error) { mod.warn('Looks Profile: cache preservado: ' + error.message); }
  }
  install(installer) {
    let gameRoot;
    let installAttempted = false;
    const info = this.mod.clientInterface.info;
    try {
      gameRoot = clientRoot(info);
      // Never replace a package that this process may already have loaded.
      const previous = readSmall(reportFile);
      if (previous && previous.pid === info.pid && samePath(previous.gameRoot, gameRoot) &&
          (previous.state === 'registered' || previous.installAttempted)) {
        this.mod.log('Looks Profile: catálogo já registrado neste processo. Reabra somente o TERA para atualizar a lista.');
        return;
      }
      const baseline = validateClient(info, gameRoot);
      const collection = catalog.read(path.join(root, 'profiles'));
      for (const warning of collection.warnings) this.mod.warn('Looks Profile: perfil ignorado: ' + warning);
      if (!collection.entries.length) {
        write(reportFile, { state: 'empty-catalog', version: '1.2.7', gameRoot, pid: info.pid, time: Date.now() });
        this.mod.log('Looks Profile: nenhum perfil válido para o catálogo.');
        return;
      }
      let patched = catalog.patch(baseline, collection.entries);
      try { patched = PortraitPackage.patch(patched, collection.entries, root, message => this.mod.warn('Looks Profile: ' + message)); }
      catch (error) { this.mod.warn('Looks Profile: retratos indisponíveis; mantendo presets de texto: ' + error.message); }
      const token = crypto.randomBytes(16).toString('hex');
      const previewPath = cache.write(info.pid, token, patched);
      installAttempted = true;
      installer.gpk(path.relative(root, previewPath), 'S1UI_CreateCharacter.gpk');
      write(reportFile, { state: 'registered', version: '1.2.7', activationRevision: 4, token,
        gameRoot, pid: info.pid, hash: hash(patched), profileId: null, catalogCount: collection.entries.length,
        source: 'manual-catalog', time: Date.now() });
      this.mod.log('Looks Profile: catálogo com ' + collection.entries.length + ' perfis registrado em ' + gameRoot + '. Sem perfil padrão; escolha em Customize → Presets.');
    } catch (error) {
      const message = String(error.message || error);
      try { write(reportFile, { state: 'failed', version: '1.2.7', gameRoot, pid: info.pid, error: message, installAttempted, time: Date.now() }); } catch (_) {}
      this.mod.warn(installAttempted ? 'Looks Profile: falha no registro; reabra somente o TERA. ' + message : 'Looks Profile: catálogo não instalado: ' + message);
    }
  }
}
module.exports = { describe, ClientMod };
