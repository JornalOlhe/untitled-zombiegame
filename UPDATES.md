# Atualizações do Dead Recoil

Android e Windows consultam as releases de `JornalOlhe/untitled-zombiegame` quando o jogo abre. Uma tag numericamente maior que a versão instalada é tratada como atualização disponível.

## Estado atual

- v9: última release Android estável assinada com `DeadRecoil.apk`.
- v10: build QA que introduziu o fluxo de atualização na inicialização para Android e Windows.
- v11: build QA com a nova roleta de suspense, near-miss visual e animação Divina.
- v12: build QA com parada centralizada da roleta e aviso somente antes de girar novamente com Mítico/Divino equipado; Android usa `versionCode 12` / `0.12.0` e Windows usa `0.12.0`.
- v13: build QA com zumbis/bosses em estilo cúbico, Mítica sem perseguição cega (só persegue alvo visível na câmera no disparo), Divina virando lança corpo a corpo, arsenal expandido para 21 armas (3 por raridade, com tipos fogo/gelo/arco/faca e habilidades), rebalanceamento de dano por raridade, lança-granadas trocado pela Bazooka (agora Lendária) e roleta Lucky Spin mais rápida e com celebração Divina em tela cheia; Android usa `versionCode 13` / `0.13.0` e Windows usa `0.13.0`.
- v14: build QA que reverte os zumbis/bosses para o modelo original (desfazendo o rig cúbico da v13) e refaz os arcos como puxar-e-soltar (segurar para carregar, soltar para atirar uma flecha com dano proporcional ao tempo de carga, munição infinita, sem recarga), com nova animação de flecha encaixada na corda; Android usa `versionCode 14` / `0.14.0` e Windows usa `0.14.0`.
- v15: build QA com a Bazooka disparando mísseis de verdade (voo reto, explosão maior, guiado se segurar o botão) em vez de granadas, e um inventário de armas de verdade: 1 slot inicial, até 5 compráveis na Armaria (preço crescente), trocando entre as armas equipadas com as teclas 1-5 durante a partida; Android usa `versionCode 15` / `0.15.0` e Windows usa `0.15.0`.
- v16: build QA com os novos monstros voxel (skins pintadas, animações próprias), bosses Demônio (a cada 20 ondas) e Yeti (a cada 10) com cinemáticas numa arena distante e queda no meio do mapa, mini-bosses Quarterback/Mutante alternados, habilidades novas, obstáculos escaláveis, medkits a cada 30 s, física de objetos e sons do ElevenLabs; Android usa `versionCode 16` / `0.16.0` e Windows usa `0.16.0`.
- v18: build QA com a câmera da intro do Demônio sem pilares na frente, animações de kill (marcador X, headshot dourado, sequências DOUBLE KILL/MASSACRE, câmera lenta e câmera cinematográfica no último zumbi da onda e ao matar chefes) e a nova morte do jogador (a visão cai no chão, a câmera sai do corpo e a horda cerca) em todos os mapas; Android usa `versionCode 18` / `0.18.0` e Windows usa `0.18.0`.
- v19: build QA com contas online (e-mail/senha, confirmação, recuperação de senha e Google via deep link `untitledzombie://auth/callback`), cross-progression no Supabase com economia validada no servidor, missões infinitas, multiplayer online 1–4 jogadores (lobby com código, quick play, ready, host autoritativo, reanimação, reconexão e migração de host), nova interface survival horror, próxima onda automática sem tela de loja, sem câmera lenta em kills e mortes cinematográficas do Demônio (portões do submundo) e do Yeti (bola de neve gigante); Android usa `versionCode 19` / `0.19.0` e Windows usa `0.19.0`.

No Windows, a v10 compara a versão do executável com as tags `vN` publicadas. Quando uma tag mais nova como `v19` estiver disponível, o jogo informa que a versão instalada está desatualizada e oferece o download do asset `DeadRecoil-Windows.exe`.

No Android, uma atualização por cima só pode ser instalada quando o APK novo usa a mesma assinatura do aplicativo instalado. Releases QA/prerelease podem abrir o asset oficial no GitHub quando a assinatura não permite instalação automática.

## Publicação assinada

O workflow de release Android estável utiliza estes GitHub Actions secrets:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_KEYSTORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

A chave privada nunca deve ser adicionada ao repositório.

## QA

Cada push na `main` executa testes de interface e gera builds de validação. A v19 possui um workflow dedicado que testa a UI, compila Android/Windows e publica a prerelease somente quando todos os jobs passam.
- v17: build QA com pity separado de Mítico/Divino para armas e classes (75/150), Normal Spin somando +1, Lucky Spin somando +2, Normal por 50 moedas e Lucky com custo base de 250 moedas; Android usa `versionCode 17` / `0.17.0` e Windows usa `0.17.0`.
