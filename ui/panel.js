'use strict';
const Renderer = require('tera-mod-ui').Renderer;
const bridge = new Renderer();
const $ = id => document.getElementById(id);
let state = null;
let busy = false;
let draftPortrait = null;
function clearDraft(){draftPortrait=null;$('draft-icon').hidden=true;$('clear-icon').hidden=true;}
function send(action, payload = {}) {
    if (busy) return;
    busy = true;
    document.querySelectorAll('.action').forEach(button => { button.disabled = true; });
    $('feedback').textContent = 'Executando…';
    bridge.send('action', action, payload);
}
function selectionDetails() {
    const profile = state && state.profiles.find(p => p.id === $('profile').value);
    $('profile-detail').textContent = profile ? `Origem: ${profile.source} · ${profile.race}, ${profile.gender}` : 'Salve um perfil na outra aba ou atualize a lista.';
    $('edit-icon').disabled = busy || !profile;
    $('profile-icon').hidden = !profile || !profile.portrait;
    if(profile && profile.portrait) $('profile-icon').src=profile.portrait; else $('profile-icon').removeAttribute('src');
}
bridge.on('state', value => {
    state = value;
    busy = false;
    const previous = $('profile').value;
    const selectionChanged = $('profile').dataset.selected !== value.selectedId;
    $('profile').textContent = '';
    const placeholder = document.createElement('option');placeholder.value = '';placeholder.textContent = 'Selecione um perfil salvo';$('profile').appendChild(placeholder);
    for (const profile of value.profiles) {
        const option = document.createElement('option');option.value = profile.id;option.textContent = `${profile.name} — ${profile.source} (${profile.race}, ${profile.gender})`;$('profile').appendChild(option);
    }
    $('profile').value = !selectionChanged && value.profiles.some(p => p.id === previous) ? previous : value.selectedId;
    $('profile').dataset.selected = value.selectedId;
    $('count').textContent = `(${value.profiles.length})`;
    $('version').textContent = 'v' + value.version;
    const count = value.profiles.length;
    $('catalog-title').textContent = count ? count + (count === 1 ? ' perfil salvo' : ' perfis salvos') : 'Salve seu primeiro perfil';
    $('catalog-badge').textContent = count ? 'Catálogo' : 'Vazio';
    $('catalog-badge').className = 'badge ' + (count ? 'on' : '');
    const legacy = value.prepared && (value.prepared.active || value.prepared.error);
    $('legacy-options').hidden = !legacy;
    $('cancel-legacy').disabled = busy || !legacy;
    $('legacy-detail').textContent = legacy ? (value.prepared.error ? value.prepared.text + '. ' + (value.prepared.detail || '') : 'Há uma escolha automática antiga salva: ' + value.prepared.text + '. Ela é opcional e não limita os presets disponíveis.') : '';
    $('session-status').textContent = value.status;
    $('feedback').textContent = value.feedback.length ? value.feedback[value.feedback.length - 1] : 'Pronto. Escolha uma ação na janela.';
    $('messages').textContent = '';
    for (const message of value.feedback) { const li = document.createElement('li');li.textContent = message;$('messages').appendChild(li); }
    $('sources').textContent = '';
    for (const name of ['self', ...value.sources]) { const option = document.createElement('option');option.value = name;$('sources').appendChild(option); }
    $('self-hint').textContent = value.selfName ? `self = ${value.selfName}. Também aceita um personagem da seleção recebida ou visível no mapa.` : 'Entre no mundo para usar self. Outro nome precisa estar na seleção recebida ou visível no mapa.';
    document.querySelectorAll('.action').forEach(button => { button.disabled = false; });
    $('cancel-legacy').disabled = !legacy;
    selectionDetails();
});
$('profile').addEventListener('change', selectionDetails);
$('cancel-legacy').addEventListener('click', () => send('cancel'));
$('reload').addEventListener('click', () => send('reload'));
$('status').addEventListener('click', () => send('status'));
$('save-form').addEventListener('submit', event => { event.preventDefault();send('save', { target: $('target').value, name: $('profile-name').value, portrait: draftPortrait }); });
const tabs = Array.from(document.querySelectorAll('[data-tab]'));
function activate(tab) { for (const button of tabs) { const active = button === tab;button.setAttribute('aria-selected', String(active));button.tabIndex = active ? 0 : -1;$(button.dataset.tab).hidden = !active; } }
tabs.forEach((tab, index) => { tab.addEventListener('click', () => activate(tab));tab.addEventListener('keydown', event => { if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;event.preventDefault();const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];activate(next);next.focus(); }); });
activate(tabs[0]);
window.addEventListener('beforeunload', () => bridge.destructor());

$('new-icon').onclick=async()=>{if(busy)return;const source=$('target').value;const png=await PortraitEditor.open('Retrato do novo perfil');if(png&&source===$('target').value){draftPortrait=png;$('draft-icon').src=png;$('draft-icon').hidden=false;$('clear-icon').hidden=false;}};
$('edit-icon').onclick=async()=>{if(busy)return;const id=$('profile').value,profile=state.profiles.find(p=>p.id===id);if(!profile)return;const png=await PortraitEditor.open('Retrato: '+profile.name);if(png&&id===$('profile').value)send('set-icon',{id,portrait:png});};
$('clear-icon').onclick=clearDraft;$('target').addEventListener('input',clearDraft);bridge.on('profile-saved',clearDraft);
bridge.send('ready');
