## Dead Recoil 0.19.0 QA

### Contas e progresso na nuvem
- Nova tela de LOGIN: **Continuar com Google** (página oficial do Google; o jogo volta sozinho pelo link `untitledzombie://auth/callback`), e-mail e senha, criar conta, confirmação de e-mail com reenvio, esqueci a senha e nova senha.
- Mensagens claras para e-mail inválido, e-mail já usado, senha incorreta, e-mail não confirmado, sem internet e sessão expirada.
- Sessão fica salva e é renovada automaticamente. Sair da conta fica em PERFIL.
- **Cross-progression:** moedas, XP, nível, armas, classes, slots, visual, configurações e estatísticas ficam na conta. O mesmo login no PC e no Android recupera o mesmo progresso.
- Toda recompensa é calculada e validada no servidor (Supabase com Row Level Security). O jogo não consegue simplesmente alterar moedas nem desbloquear itens.
- **Offline:** o SOLO continua funcionando. Partidas offline de quem está logado são sincronizadas quando a internet volta, sem duplicar recompensa. Visitantes continuam com o save local.

### Missões infinitas
- 3 missões ativas. COLETAR entrega a recompensa e gera uma nova na hora.
- 14 tipos: kills, arma específica, headshots, ondas, chefes, mini-bosses, dano, reanimar aliados, moedas, ondas sem levar dano, dificuldade, classe, mapa e partidas multiplayer.
- 7 raridades (Comum → Divina): quanto mais rara, maior o objetivo e a recompensa.
- As missões respeitam o que você já desbloqueou e não repetem as mais recentes.

### Multiplayer online (1–4 jogadores)
- JOGAR → SOLO ou MULTIPLAYER, com QUICK PLAY, CRIAR LOBBY (código de 6 letras) e ENTRAR COM CÓDIGO.
- O lobby mostra jogadores, READY, ping, host, mapa, dificuldade e modo. Só o host inicia, e só quando todos estão prontos.
- O host controla zumbis, ondas, chefes e mortes. Os outros jogadores veem tudo sincronizado e com interpolação.
- Aliado caído pode ser reanimado segurando **E** (ou o botão REANIMAR no celular).
- Se a conexão cair aparece "CONNECTION LOST / Reconectando…". Se o host sair, outro jogador assume a partida.
- Nova dificuldade: **Pesadelo**.

### Combate
- Sem câmera lenta ao matar e sem animação no último zumbi da onda.
- A tela de loja entre as ondas foi removida: a próxima onda começa sozinha.
- Mortes cinematográficas só para os chefes: o **Demônio** é arrastado pelos portões do submundo, e o **Yeti** é esmagado por uma bola de neve gigante.

### Interface nova
- Visual survival horror em todas as telas: HOME, perfil (LVL, XP, moedas, estatísticas), missões, multiplayer, lobby, erros e conexão.
- Funciona em PC e celular, em qualquer resolução.

### Versões
- Android: versionCode 19 / versionName 0.19.0.
- Windows: versão 0.19.0.
