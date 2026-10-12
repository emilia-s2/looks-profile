# Looks Profile

Salve a aparência de personagens do TERA e escolha seus perfis como presets em **Customize → Presets**, com retratos opcionais e ajustes de **Fine Details**.

Todos os perfis compatíveis aparecem juntos no criador. Não é necessário preparar ou ativar cada um.

## Instalação

1. Coloque a pasta `looks-profile-manager` em `tera-toolbox/mods`.
2. Inicie o Toolbox antes de abrir o TERA. Para usar a janela de perfis, execute o Toolbox em modo gráfico.

**Compatibilidade:** cliente x64, versão 100.2, com a interface original compatível. Foi utilizado em TERA Asura e TERA Astrix; o mod recusa interfaces com assinatura diferente.

## Como usar

1. Dentro do jogo, use **Ctrl+Alt+L** ou digite `/8 lookprofile` para abrir a janela.
2. Em **Salvar perfil**, use `self` para seu personagem ou informe o nome de um personagem recebido na seleção ou visível no mapa. Dê um nome ao perfil e salve.
3. Reabra **somente o TERA**, mantendo o Toolbox iniciado, para atualizar o catálogo.
4. No criador, escolha raça, gênero e classe, entre em **Customize → Presets** e clique em um dos seus presets ao lado do botão aleatório.

Somente perfis da mesma raça e gênero aparecem; a classe pode ser diferente. Passe o mouse para ver o nome e use as setas quando houver mais presets.

Aguarde a mensagem de conclusão antes de ajustar o personagem. A aplicação pode levar alguns segundos; mexer nos controles durante esse processo interrompe a fila. Depois, você pode editar o visual ou escolher outro preset. Confira o resultado antes de clicar em **Complete**.

**Já tem perfis salvos?** Coloque os JSON na pasta `profiles` antes de abrir o jogo. Eles também ficam disponíveis para criar seu primeiro personagem, sem comandos ou edição de configuração.

## Idioma da janela

Use **Idioma**, no topo da GUI, para escolher **Automático**, **Português**, **English** ou **Español (Latinoamérica)**. A troca é imediata e fica salva em `config.json`, no campo `data.language`: `auto`, `pt`, `en` ou `es`. O modo automático usa o idioma do sistema; idiomas fora desses três usam inglês. Não é necessário instalar os mods de guia.

## Retratos opcionais

Em **Salvar perfil → Escolher retrato opcional**, abra uma captura PNG/JPEG ou cole um print, enquadre o rosto e confirme. O retrato é salvo junto com o novo perfil.

Para um perfil existente, use **Perfis salvos → Adicionar ou trocar retrato**. A seleção nessa janela serve para consultar o perfil e editar o retrato; a aparência é escolhida no criador.

Os ícones têm 64 × 64 pixels. Prefira uma captura com o rosto próximo e compare a opção **Nitidez suave**. Reabra somente o TERA para atualizar os ícones no criador. Sem retrato, o botão mostra “Preset 1”, “Preset 2” etc. A captura não é automática.

## Comandos

| Comando | Função |
| --- | --- |
| `/8 lookprofile` | Abrir a janela de perfis. |
| `/8 lookprofile save self Nome do perfil` | Salvar seu personagem pelo chat. |
| `/8 lookprofile status` | Consultar o registro do catálogo e a sessão. |
| `/8 lookprofile reload` | Atualizar a lista da janela. |

Atualizar a lista não substitui o catálogo já carregado no jogo: perfis e retratos novos exigem reabrir o TERA. Voltar ao login ou parar/iniciar o Toolbox com o mesmo jogo aberto não atualiza esse catálogo.

`config.json` é mantido pelo Toolbox para preferências. Não guarda perfil padrão: os campos antigos são removidos automaticamente. A janela abre sem perfil selecionado e nenhum preset é aplicado até você clicar nele no criador. Os comandos antigos de preparação não ativam perfis.

<details>
<summary>Arquivos e limites</summary>

- `profiles`: dados dos perfis; até 64 no catálogo. Arquivos inválidos são ignorados com aviso, sem serem apagados.
- `icons`: retratos opcionais. Guarde essas duas pastas para transferir seus presets.
- `preview-cache`: pacote temporário da interface. A limpeza remove os pacotes gerados de processos encerrados; não apaga os perfis.
- O Toolbox registra uma interface temporária; os arquivos originais do jogo não são modificados.
- São aplicados cabelo, rosto, cores, adornos, voz e até 30 controles de Fine Details. `shape` e `appearance2` são preservados no perfil, mas não aplicados pelos controles mapeados.
- “Registrado” no log confirma o carregamento pelo Toolbox; confira a mensagem de conclusão e a aparência no criador.

</details>
