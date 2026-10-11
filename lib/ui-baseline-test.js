'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const root = path.join(__dirname, '..');
const cache = require('./preview-cache')(root);
const requestFile = path.join(root, 'ui-test-request.json');
const reportFile = path.join(root, 'ui-test-report.json');
const resource = path.join(root, 'resources', 'creator-profile.gpk.gz');
const baselineHash = 'ba7f68388490e2649b5383e73cfd3d55c4d5979a4eac9c0ba59f8ed14a27f45d';
const catalog = require('./catalog');
const PortraitPackage = require('./portrait-package');
const sourceHash = 'b06b5a4b37f890d18d4b3d936d5850e03fc1fb483c479b5c301963a23b64c2ef';
// Existing legacy tests expire; explicit next-launch requests last until used/cancelled.
const maxAgeMs = 60 * 60 * 1000;
function isExpired(request) {
  return request.activation !== 'next-launch' && Date.now() - request.createdAt > maxAgeMs;
}

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

const selectionStore = require('./selection')(root);
function resolveStartupProfile(value) {
  const directory = path.join(root, 'profiles');
  if (/^[a-z0-9_-]{1,100}$/.test(value) && fs.existsSync(path.join(directory, value + '.json'))) {
    loadProfile(value); return value;
  }
  const found = [];
  for (const name of fs.readdirSync(directory)) {
    if (!/^[a-z0-9_-]{1,100}\.json$/.test(name)) continue;
    const file = path.join(directory, name);
    if (!fs.statSync(file).isFile() || fs.statSync(file).size > 65536) continue;
    let profile;
    try { profile = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { continue; }
    if (typeof profile.profileName === 'string' && profile.profileName.trim().toLowerCase() === value.toLowerCase()) {
      const id = name.slice(0, -5); loadProfile(id); found.push(id);
    }
  }
  if (!found.length) throw Error('Perfil de profileOnNextLaunch nao encontrado. Use o nome do perfil salvo, nao o nome do personagem.');
  if (found.length !== 1) throw Error('Ha perfis com o mesmo nome. Em profileOnNextLaunch use o nome do arquivo sem .json.');
  return found[0];
}
function prepare(mod) {
  const info = mod.clientInterface && mod.clientInterface.info;
  const gameRoot = clientRoot(info);
  const baseline = validateClient(info, gameRoot);
  const profileId = mod.settings.selectedProfileId;
  const profile = loadProfile(profileId);
  // Validate the complete payload before telling the user preparation succeeded.
  const preparedCatalog = catalog.read(path.join(root, 'profiles'));
  catalog.patch(baseline, preparedCatalog.entries, profileId);
  const request = { profileId, activation: 'next-launch', version: 1, token: crypto.randomBytes(16).toString('hex'), state: 'pending', gameRoot, createdAt: Date.now(), preparedPid: info.pid, persistent: true, source: 'command' };
  selectionStore.save(mod, profileId, request);
  mod.command.message('Looks Profile: perfil "' + profile.profileName + '" preparado com sucesso! Reinicie somente o TERA e mantenha o Toolbox iniciado. Escolha a mesma raca e genero. A escolha fica salva na GUI e nos dois JSON ate trocar ou cancelar.');
}

function cancel(mod) {
  const pending = readSmall(requestFile);
  selectionStore.save(mod, '', { ...(pending || {}), state: 'cancelled' });
  mod.command.message('Looks Profile: preparacao cancelada. Se a interface ja foi carregada, a aplicacao automatica para ao reabrir o TERA. Os presets salvos continuam disponiveis na personalizacao.');
}

function describe(mod) {
  const pending = readSmall(requestFile);
  const report = readSmall(reportFile);
  const info = mod.clientInterface && mod.clientInterface.info;
  const currentReport = report && info && report.pid === info.pid && samePath(report.gameRoot, clientRoot(info));
  if (currentReport && (report.state === 'failed' || report.state === 'wrong-client'))
    return 'Perfil nao instalado nesta abertura: ' + (report.error || report.state) + '. A escolha salva foi preservada.';
  if (pending && pending.state === 'pending') {
    if (isExpired(pending)) return 'Teste de interface expirado; nada será instalado.';
    return 'Perfil preparado: ' + pending.profileId + '. Reabra somente o TERA; a instalacao aberta sera validada antes de carregar.';
  }
  if (pending && pending.state === 'expired') return 'Preparacao antiga expirou antes de carregar o perfil. Prepare novamente com /8 lookprofile arm.';
  if (!report || !info || report.pid !== info.pid || !samePath(report.gameRoot, clientRoot(info)))
    return 'Teste de interface desativado; aplicação de perfil suspensa.';
  if (report.state === 'registered') return 'Catalogo registrado: ' + report.catalogCount + ' perfis. ' + (report.profileId ? 'Perfil automatico: ' + report.profileId + '. ' : 'Sem aplicacao automatica. ') + 'Em Presets, clique em um preset salvo da mesma raca e genero. Confira o resultado no criador.';
  if (report.installAttempted) return `Falha no registro do teste: ${report.error}. Feche o TERA para retirar qualquer pacote já carregado.`;
  return `Teste não instalado: ${report.error || report.state}.`;
}


function loadProfile(id) {
  if(typeof id!=='string' || !/^[a-z0-9_-]{1,100}$/.test(id)) throw Error('Perfil selecionado invalido.');
  const file=path.join(root,'profiles',id+'.json');
  if(fs.statSync(file).size>65536)throw Error('Perfil excede o limite.');
  const profile=JSON.parse(fs.readFileSync(file,'utf8'));
  const error=require('./profile').validateProfile(profile);
  if(error)throw Error(error);
  return profile;
}
function patchProfile(bytes, profile) {
  return catalog.patch(bytes, [{ id: 'prepared', profile }], 'prepared');
}

class ClientMod {
  constructor(mod) {
    this.mod = mod;
    if (mod.settings && mod.settings.profileOnNextLaunch === undefined) mod.settings.profileOnNextLaunch = '';
    try { cache.resume(); } catch (error) { mod.warn('Looks Profile: cache preservado: ' + error.message); }
  }
  install(installer) {
    let request;
    let gameRoot;
    let installAttempted = false;
    const info = this.mod.clientInterface.info;
    try {
      gameRoot = clientRoot(info);
      request = readSmall(requestFile);
      const selection = selectionStore.selected();
      let selectedId = null;
      if (selection.value) {
        try { selectedId = resolveStartupProfile(selection.value); }
        catch (error) { this.mod.warn('Looks Profile: automatico indisponivel; escolha salva preservada: ' + error.message); }
      }
      if (selection.warning) this.mod.warn('Looks Profile: ' + selection.warning);

      // Neither a reload nor a JSON edit can replace an already attempted package
      // in the same running game. The persisted choice is used by the next game.
      const previous = readSmall(reportFile);
      if (previous && previous.pid === info.pid && samePath(previous.gameRoot, gameRoot) &&
          (previous.state === 'registered' || previous.installAttempted)) {
        this.mod.log('Looks Profile: este processo ja recebeu uma tentativa de registro. Para trocar o perfil, reabra somente o TERA.');
        return;
      }
      if (request && request.installedPid === info.pid && samePath(request.gameRoot, gameRoot)) {
        this.mod.log('Looks Profile: tentativa ja realizada neste processo; reabra somente o TERA.');
        return;
      }
      if (request && request.state === 'pending' && request.preparedPid === info.pid && samePath(request.gameRoot, gameRoot)) {
        this.mod.log('Looks Profile: perfil preparado; aguardando voce reabrir somente o TERA.');
        return;
      }

      // Old nonpersistent tests retain their original client restriction. Current
      // persistent selections always validate and target the client opening now.
      const legacy = request && request.state === 'pending' && !request.persistent;
      if (legacy && !samePath(request.gameRoot, gameRoot)) {
        const error = 'Preparacao antiga pertence a outra pasta do TERA. Use lookprofile arm ou profileOnNextLaunch para preparar o cliente atual.';
        write(reportFile, { state: 'wrong-client', version: '1.2.2', gameRoot, pid: info.pid, error, time: Date.now() });
        this.mod.warn('Looks Profile: ' + error);
        return;
      }

      if (legacy) {
        const invalid = request.version !== 1 || !/^[a-f0-9]{32}$/.test(request.token) || !Number.isFinite(request.createdAt) || Date.now() < request.createdAt || (request.activation !== undefined && request.activation !== 'next-launch');
        if (invalid || isExpired(request)) throw Error(invalid ? 'Preparacao antiga invalida; prepare novamente.' : 'Preparacao antiga expirou; prepare novamente.');
      }

      const baseline = validateClient(info, gameRoot);
      const profileId = legacy ? request.profileId : selectedId;
      const collection = catalog.read(path.join(root, 'profiles'));
      for (const warning of collection.warnings) this.mod.warn('Looks Profile: perfil ignorado: ' + warning);
      if (!collection.entries.length) {
        write(reportFile, { state: 'not-prepared', version: '1.2.2', gameRoot, pid: info.pid, time: Date.now() });
        this.mod.log('Looks Profile: nenhum perfil valido para o catalogo.');
        return;
      }
      let patched = catalog.patch(baseline, collection.entries, profileId);
      try { patched = PortraitPackage.patch(patched, collection.entries, root, message => this.mod.warn('Looks Profile: '+message)); }
      catch(error) { this.mod.warn('Looks Profile: retratos indisponíveis; mantendo presets de texto: '+error.message); }
      // Fresh request per process avoids an old root/PID/token blocking a valid
      // persistent profile, including after a crash or a switch of installation.
      request = { profileId, activation: 'next-launch', version: 1, token: crypto.randomBytes(16).toString('hex'),
        state: 'consumed', gameRoot, createdAt: Date.now(), consumedAt: Date.now(), installedPid: info.pid,
        persistent: !legacy, source: legacy ? 'legacy-command' : selection.source };
      if (legacy) write(requestFile, request);
      else if (!selection.value || selectedId) selectionStore.save(this.mod, profileId || '', request);
      else write(requestFile, request);
      const previewPath = cache.write(info.pid, request.token, patched);
      installAttempted = true;
      installer.gpk(path.relative(root, previewPath), 'S1UI_CreateCharacter.gpk');
      write(reportFile, { state: 'registered', version: '1.2.2', activationRevision: 3, token: request.token,
        gameRoot, pid: info.pid, hash: hash(patched), profileId, catalogCount: collection.entries.length, persistent: !legacy, source: request.source, time: Date.now() });
      this.mod.log('Looks Profile: catalogo com ' + collection.entries.length + ' perfis registrado em ' + gameRoot + (profileId ? '; automatico: ' + profileId : '; escolha um preset na personalizacao') + '. Escolha preservada.');
    } catch (error) {
      const message = String(error.message || error);
      try {
        if (request && request.installedPid === info.pid && gameRoot && samePath(request.gameRoot, gameRoot))
          write(requestFile, { ...request, state: 'failed', error: message });
        write(reportFile, { state: 'failed', version: '1.2.2', gameRoot, pid: info.pid, error: message, installAttempted, time: Date.now() });
      } catch (_) {}
      this.mod.warn(installAttempted
        ? 'Looks Profile: falha no registro; reabra somente o TERA. ' + message
        : 'Looks Profile: perfil nao instalado: ' + message);
    }
  }
}

module.exports = { prepare, cancel, describe, ClientMod, patchProfile, selection: () => selectionStore.selected() };
