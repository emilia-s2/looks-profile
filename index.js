'use strict';

const fs = require('fs');
const path = require('path');
const ProfilePanel = require('./lib/panel');
const Profile = require('./lib/profile');
const UiTest = require('./lib/ui-baseline-test');
const Portraits = require('./lib/portraits');

module.exports = function LooksProfileManager(mod) {
	const profilesDirectory = path.join(__dirname, 'profiles');
	const playerData = new Map();
	const lobbyData = new Map();
	let selfData = null;
	let profiles = new Map();
	let settingsUi = null;
	const feedback = [];
    const controlMod = Object.create(mod);
    Object.defineProperty(controlMod, 'command', { value: { message: message => notify(message) } });

	mod.settings.selectedProfileId = typeof mod.settings.selectedProfileId === 'string' ? mod.settings.selectedProfileId : '';
// Recovery: keep saved profiles, but never re-enable the rejected creation experiment.
	mod.settings.applyNextCreate = false;

	mod.hook('S_LOGIN', mod.majorPatchVersion >= 114 ? 15 : 14, event => {
		selfData = event;
	});

	mod.hook('S_SPAWN_USER', mod.majorPatchVersion >= 99 ? 16 : 15, event => {
		playerData.set(event.gameId, event);
	});

	mod.hook('S_DESPAWN_USER', 3, event => {
		playerData.delete(event.gameId);
	});

	mod.hook('S_LOAD_TOPO', 'raw', () => {
		playerData.clear();
	});

	if (mod.majorPatchVersion >= 95 && mod.majorPatchVersion < 101) {
		mod.hook('S_GET_USER_LIST', 18, storeLobbyCharacters);
	} else if (mod.majorPatchVersion >= 86 && mod.majorPatchVersion < 95) {
		mod.hook('S_GET_USER_LIST', 17, storeLobbyCharacters);
	}

	mod.command.add('lookprofile', (action, ...args) => dispatch(action, args));

	function dispatch(action, args) {
		try {
		switch ((action || '').toLowerCase()) {
			case 'test-profile':
			case 'test-ui':
				try {
					if (args[0] === 'cancel') UiTest.cancel(controlMod);
					else if (args[0] === 'status') notify(UiTest.describe(mod));
					else if (args.length === 0) UiTest.prepare(controlMod);
					else notify('Uso: /8 lookprofile test-ui [status | cancel]');
				} catch (error) { notify('Looks Profile: ' + error.message); }
				break;
			case 'save': {
				const targetName = args.shift() || 'self';
				const profileName = args.join(' ').trim();
				saveProfile(targetName, profileName);
				break;
			}
			case 'select':
				selectProfile(args.join(' ').trim());
				break;
			case 'arm':
				armSelectedProfile();
				break;
			case 'disarm':
				mod.settings.applyNextCreate = false;
				refreshSettingsUi();
				try { UiTest.cancel(controlMod); } catch (error) { notify('Looks Profile: ' + error.message); }
				break;
			case 'status':
				showStatus();
				break;
			case 'reload':
				loadProfiles();
				rebuildSettingsUi();
				notify(`Looks Profile: ${profiles.size} perfil(is) completo(s) carregado(s).`);
				break;
			case 'gui':
			case '':
				openSettings();
				break;
			default:
				notify('Uso: /8 lookprofile [save <personagem|self> [nome do perfil] | select <nome> | arm | disarm | status | reload | test-ui]');
		}
		} finally { refreshSettingsUi(); }
	}

	loadProfiles();
	rebuildSettingsUi();

	function notify(message) {
        feedback.push(String(message));
        if (feedback.length > 6) feedback.shift();
        mod.command.message(message);
    }

	function escapeHtml(value) {
		return String(value).replace(/[&<>"']/g, character => ({
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;'
		})[character]);
	}

	function storeLobbyCharacters(event) {
		if (event.first)
			lobbyData.clear();
		if (!Array.isArray(event.characters))
			return;
		for (const character of event.characters) {
			if (character && typeof character.name === 'string' && character.name.length)
				lobbyData.set(character.name.toLowerCase(), character);
		}
	}

	function slugify(value) {
		return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'perfil';
	}

	function loadProfiles() {
		profiles = new Map();
		try {
			fs.mkdirSync(profilesDirectory, { recursive: true });
			for (const filename of fs.readdirSync(profilesDirectory)) {
				if (!filename.endsWith('.json'))
					continue;
				const filePath = path.join(profilesDirectory, filename);
				try {
					const stat = fs.statSync(filePath);
					if (!stat.isFile() || stat.size > 65536)
						continue;
					const profile = JSON.parse(fs.readFileSync(filePath, 'utf8'));
					if (Profile.validateProfile(profile))
						continue;
					profiles.set(path.basename(filename, '.json'), profile);
				} catch (error) {
					console.warn(`[looks-profile] Ignorando ${filename}: ${error.message}`);
				}
			}
		} catch (error) {
			console.error(`[looks-profile] Não foi possível ler os perfis: ${error.message}`);
		}
		if (!profiles.has(mod.settings.selectedProfileId))
			mod.settings.selectedProfileId = '';
	}

    function plainMessage(value) {
        return String(value).replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    }

    function preparedState() {
        try {
            const selection = UiTest.selection();
            const choice = selection.value;
            const source = selection.source;
            if (!choice) return { active: false, text: 'Nenhum perfil preparado' };
            const exact = profiles.get(choice);
            const matches = exact ? [exact] : Array.from(profiles.values()).filter(p => p.profileName.trim().toLowerCase() === choice.toLowerCase());
            if (matches.length !== 1) return { active: false, error: true, text: 'Configuração precisa de atenção: ' + choice, detail: 'Perfil ausente ou nome repetido na configuração antiga. Confira o nome/ID no JSON ou desative essa escolha na aba Ajuda.' };
            return { active: true, text: matches[0].profileName, detail: 'Ativo nas próximas aberturas do TERA, até trocar ou cancelar.' + (selection.warning ? ' ' + selection.warning : ''), source };
        } catch (error) { return { active: false, error: true, text: 'Não foi possível ler a preparação', detail: error.message }; }
    }

    function panelState() {
        let status;
        try { status = UiTest.describe(mod); } catch (error) { status = error.message; }
        return {
            version: '1.2.3', selectedId: mod.settings.selectedProfileId,
            profiles: Array.from(profiles, ([id, p]) => ({ id, name: p.profileName, source: p.sourceName || 'Origem desconhecida', race: raceName(p.race), gender: genderName(p.gender), details: p.details.length, portrait: Portraits.preview(__dirname, id) })),
            prepared: preparedState(), status: plainMessage(status), feedback: feedback.map(plainMessage),
            selfName: selfData && selfData.name || '',
            sources: Array.from(new Set([...Array.from(lobbyData.values(), c => c.name), ...Array.from(playerData.values(), c => c.name)]))
        };
    }

    function panelAction(action, payload) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = {};
            switch (action) {
                case 'select':
                case 'prepare':
                    if (typeof payload.id !== 'string' || !profiles.has(payload.id)) throw Error('Selecione um perfil salvo válido.');
                    dispatch('select', [payload.id]);
                    if (action === 'prepare') dispatch('arm', []);
                    break;
                case 'save': {
                    const target = typeof payload.target === 'string' ? payload.target.trim() : '';
                    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
                    if (target.length > 100 || name.length > 100) throw Error('Use até 100 caracteres por campo.');
                    const id = saveProfile(target || 'self', name, payload.portrait);
                    if(id && settingsUi) settingsUi.send('profile-saved', {id});
                    break;
                }
                case 'set-icon':
                    if(typeof payload.id !== 'string' || !profiles.has(payload.id)) throw Error('Selecione um perfil salvo válido.');
                    Portraits.save(__dirname, payload.id, payload.portrait);
                    notify('Looks Profile: retrato salvo. Reabra somente o TERA para atualizar o ícone no criador.');
                    break;
                case 'cancel': dispatch('disarm', []); break;
                case 'status': dispatch('status', []); break;
                case 'reload': dispatch('reload', []); break;
                default: throw Error('Ação da janela não reconhecida.');
            }
        } catch (error) { notify('Looks Profile: ' + error.message); }
        finally { refreshSettingsUi(); }
    }

    function rebuildSettingsUi() { refreshSettingsUi(); }

    function refreshSettingsUi() {
        if (settingsUi) settingsUi.update(panelState());
    }

    function openSettings() {
        if (!global.TeraProxy || !global.TeraProxy.GUIMode) {
            notify('Looks Profile: abra o TERA Toolbox em modo gráfico para usar a janela de perfis.');
            return;
        }
        if (!settingsUi) settingsUi = new ProfilePanel(mod, panelState, panelAction);
        settingsUi.show();
    }

	function raceName(race) {
		return ['Humana', 'Castanic', 'Aman', 'Elfa alta', 'Popori/Elin', 'Baraka'][race] || `raça ${race}`;
	}

	function genderName(gender) {
		return gender === 1 ? 'feminino' : 'masculino';
	}

	function chooseSource(name) {
		const normalizedName = String(name || 'self').trim().toLowerCase();	
		if (normalizedName === 'self' || (selfData && normalizedName === String(selfData.name || '').toLowerCase())) {
			if (!selfData)
				return { error: 'Dados do seu personagem ainda não chegaram. Entre no mundo uma vez ou salve um personagem da seleção.' };
			return { data: selfData };
		}

		const lobbyCharacter = lobbyData.get(normalizedName);
		if (lobbyCharacter)
			return { data: lobbyCharacter, identity: Profile.identityFromLobbyCharacter(lobbyCharacter) };

		const player = Array.from(playerData.values()).find(entry => String(entry.name || '').toLowerCase() === normalizedName);
		if (player)
			return { data: player };
		return { error: `Não encontrei “${escapeHtml(name)}”. Use self, um personagem da seleção ou alguém que esteja visível no mapa.` };
	}

	function saveProfile(targetName, requestedProfileName, portrait = null) {
		const source = chooseSource(targetName);
		if (source.error) {
			notify(`Looks Profile: ${source.error}`);
			return;
		}
		const profileName = requestedProfileName || String(source.data.name || targetName || 'Perfil').trim();
		let profile;
		try {
			profile = Profile.createProfile(profileName, source.data, source.identity || null);
		} catch (error) {
			notify(`Looks Profile: perfil não salvo. ${error.message}`);
			return;
		}

		try {
			fs.mkdirSync(profilesDirectory, { recursive: true });
			const baseId = `${slugify(profile.profileName)}_${Date.now()}`;
			let id = baseId;
			let suffix = 1;
			while (fs.existsSync(path.join(profilesDirectory, `${id}.json`)))
				id = `${baseId}_${suffix++}`;
			const finalPath = path.join(profilesDirectory, `${id}.json`);
			const temporaryPath = `${finalPath}.tmp`;
			fs.writeFileSync(temporaryPath, `${JSON.stringify(profile, null, 2)}\n`, { flag: 'wx' });
			fs.renameSync(temporaryPath, finalPath);
            if(portrait) { try { Portraits.save(__dirname, id, portrait); } catch(error) { notify('Looks Profile: aparência salva, mas o retrato não foi gravado: '+error.message); } }
			loadProfiles();
			mod.settings.selectedProfileId = id;

			rebuildSettingsUi();
			notify(`Looks Profile: “${escapeHtml(profile.profileName)}” salvo com aparência, details e shape completos. Origem: ${escapeHtml(profile.sourceName)}. Reabra somente o TERA, mantendo o Toolbox iniciado, e escolha este perfil em Customize → Presets.`);
			return id;
		} catch (error) {
			notify(`Looks Profile: erro ao salvar o perfil: ${error.message}`);
		}
	}

	function findProfileId(name) {
		if (profiles.has(name))
			return name;
		const normalized = name.toLowerCase();
		for (const [id, profile] of profiles) {
			if (profile.profileName.toLowerCase() === normalized)
				return id;
		}
		return null;
	}

	function selectProfile(name) {
		const id = findProfileId(name);
		if (!id) {
			notify('Looks Profile: perfil não encontrado. Abra /8 lookprofile para ver a lista ou use /8 lookprofile reload.');
			return;
		}
		mod.settings.selectedProfileId = id;

		refreshSettingsUi();
		notify(`Looks Profile: perfil selecionado: “${escapeHtml(profiles.get(id).profileName)}”, origem ${escapeHtml(profiles.get(id).sourceName)}.`);
	}

	function armSelectedProfile() {
		mod.settings.applyNextCreate = false;
		refreshSettingsUi();
		try { UiTest.prepare(controlMod); } catch(error) { notify('Looks Profile: ' + error.message); }
	}

	function showStatus() {
		const profile = profiles.get(mod.settings.selectedProfileId);
		const selected = profile ? `“${escapeHtml(profile.profileName)}”, origem ${escapeHtml(profile.sourceName)} (${raceName(profile.race)}, ${genderName(profile.gender)})` : 'nenhum';
		notify(`Looks Profile 1.2.3: ${profiles.size} perfil(is) salvo(s); selecionado: ${selected}. Todos os perfis salvos entram no catalogo ao reabrir somente o TERA. Escolha um preset compativel em Customize → Presets.`);
		try { notify(UiTest.describe(mod)); } catch (error) { notify('Looks Profile: teste indisponível: ' + error.message); }
	}

	this.destructor = () => {
		if (settingsUi) {
			settingsUi.destructor();
			settingsUi = null;
		}
		mod.command.remove('lookprofile');
	};
};

module.exports.NetworkMod = module.exports;
module.exports.ClientMod = UiTest.ClientMod;
