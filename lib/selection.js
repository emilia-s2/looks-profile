'use strict';

const fs = require('fs');
const path = require('path');

// Keep the two supported JSON entry points and Toolbox's shared settings in sync.
// The saved baseline identifies WHICH file was edited; file mtimes are unreliable
// because Toolbox also rewrites config.json on Stop without changing its values.
module.exports = function selectionStore(root) {
    const configFile = path.join(root, 'config.json');
    const startupFile = path.join(root, 'startup-profile.json');
    const requestFile = path.join(root, 'ui-test-request.json');
    const stateFile = path.join(root, 'selection-state.json');
    function read(file) {
        if (!fs.existsSync(file)) return null;
        if (fs.statSync(file).size > 16384) throw Error('Arquivo de configuracao excede o limite.');
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    function documents() {
        const config = read(configFile), startup = read(startupFile);
        if (config !== null && (config.version !== 1 || !config.data || typeof config.data !== 'object' || Array.isArray(config.data)))
            throw Error('config.json invalido; confira version e data.');
        if (startup !== null && (typeof startup !== 'object' || Array.isArray(startup)))
            throw Error('startup-profile.json invalido.');
        return { config, startup };
    }
    function choice(value, label) {
        if (value === undefined) return '';
        if (typeof value !== 'string' || value.length > 200) throw Error(label + ': profileOnNextLaunch deve ser um texto de ate 200 caracteres.');
        return value.trim();
    }
    function selected() {
        const { config, startup } = documents();
        const c = choice(config ? config.data.profileOnNextLaunch : undefined, 'config.json');
        const s = choice(startup ? startup.profileOnNextLaunch : undefined, 'startup-profile.json');
        if (c === s) return { value: c, source: 'config.json + startup-profile.json' };
        const state = read(stateFile);
        if (state !== null && (state.version !== 1 || typeof state.profileId !== 'string'))
            throw Error('selection-state.json invalido; prepare novamente pela GUI ou comando.');
        const baseline = state && state.profileId;
        if (typeof baseline === 'string') {
            if (c === baseline) return { value: s, source: 'startup-profile.json' };
            if (s === baseline) return { value: c, source: 'config.json' };
        }
        // Migration from older versions, or both files edited: config wins when
        // filled, and the decision is exposed instead of silently using old data.
        const useConfig = !!c;
        return { value: useConfig ? c : s, source: useConfig ? 'config.json' : 'startup-profile.json',
            warning: c && s ? 'Os dois JSON tinham escolhas diferentes; foi usada a escolha de config.json.' : undefined };
    }
    function replace(file, bytes) {
        fs.writeFileSync(file + '.tmp', bytes);
        fs.renameSync(file + '.tmp', file);
    }
    function save(mod, id, request) {
        const { config, startup } = documents();
        const data = { ...(config ? config.data : mod.settings), profileOnNextLaunch: id, applyNextCreate: false };
        if (id) data.selectedProfileId = id;
        else if (typeof mod.settings.selectedProfileId === 'string') data.selectedProfileId = mod.settings.selectedProfileId;
        const changes = [
            [configFile, { ...(config || { version: 1 }), data }],
            [startupFile, { ...(startup || {}), profileOnNextLaunch: id }],
            [stateFile, { version: 1, profileId: id }]
        ];
        if (request !== undefined) changes.push([requestFile, request]);
        const originals = changes.map(([file]) => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]);
        let written = 0;
        try {
            for (const [file, value] of changes) { replace(file, JSON.stringify(value, null, 2) + '\n'); written++; }
        } catch (error) {
            let rollbackError = '';
            for (let i = written - 1; i >= 0; i--) {
                const [file, bytes] = originals[i];
                try { if (bytes === null) fs.unlinkSync(file); else replace(file, bytes); }
                catch (failure) { rollbackError = '; nao foi possivel restaurar ' + path.basename(file) + ': ' + failure.message; }
            }
            throw Error('Preparacao nao foi salva: ' + error.message + rollbackError);
        }
        Object.assign(mod.settings, data);
    }
    return { selected, save };
};
