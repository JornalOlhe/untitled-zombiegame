# Dead Recoil

Jogo de sobrevivência em primeira pessoa para Android e Windows, com ondas, mapas, classes, armas e controles próprios para cada plataforma.

## Jogar

### Android

Baixe `DeadRecoil-v25.apk` na última release. O jogo consulta novas releases automaticamente; quando existe uma versão maior, baixa o APK oficial e abre a atualização do Android. A instalação por cima exige a mesma assinatura da versão instalada.

### Windows

Baixe `DeadRecoil-Setup-0.25.0.exe` na última release e instale uma vez. A partir do setup, o próprio jogo detecta novas releases, baixa o próximo instalador, valida o SHA-256, instala em silêncio e reabre a versão nova; não depende mais do executável portátil antigo.

Controles principais: `WASD` para mover, mouse para mirar e atirar, `R` para recarregar, `Esc` para pausar e `F11` ou `Alt+Enter` para alternar tela cheia.

## Armory

O Armory usa dois tipos de spin. O Normal Spin custa 50 moedas e soma +1 nos pities; o Lucky Spin tem custo base de 250 moedas, soma +2 e entrega Épico, Lendário, Mítico, Divino ou Secreto. Na v25 a chance protótipo de Secreto é 0,01% no Normal e 0,10% no Lucky, igual para classes e armas. Armas e classes possuem pities separados: 75 garante Mítico ou superior e 150 garante Divino ou superior. Um Mítico reseta apenas o pity Mítico; Divino/Secreto resetam os dois. A roleta mantém a sequência longa, near-miss visual e encaixe final no centro sem alterar o resultado real.

## Online (contas, missões e multiplayer)

A partir da v19 o jogo tem contas (e-mail/senha e Google), cross-progression entre PC e Android, missões infinitas e multiplayer online de 1 a 4 jogadores. O backend é Supabase. Veja `supabase/README.md` para a arquitetura, as migrations e os três ajustes de painel (URLs de retorno, Google e SMTP). O modo SOLO continua funcionando offline.

Código do cliente em `android/app/src/main/assets/js/`:
- `auth/`: AuthService e GoogleAuth
- `data/`: Backend e repositórios
- `missions/`: definições e gerenciador
- `network/`: transporte realtime e LobbyManager
- `ui/`: telas de login, perfil, missões e lobby

A sincronização da partida (NetGame) fica em `index.html`.

Testes: `tests/ui-smoke.cjs`, `tests/monsters-smoke.cjs`, `tests/deathkill-smoke.cjs`, `tests/multiplayer-local.cjs` (dois clientes reais usando `?net=local`) e `supabase/tests/backend_smoke.sql`.

## Builds

A `main` acompanha a release atual. A v25 publica um instalador NSIS para Windows e um APK para Android, ambos validados pelos workflows antes da publicação.

## Desenvolvimento

O jogo está em `android/app/src/main/assets/index.html`. O wrapper Android e o atualizador ficam em `android/app/src/main/java/com/deadrecoil/game/`. O runtime Windows fica em `desktop/`.

O workflow Android compila, testa os fluxos em vários tamanhos de tela e gera QA. A publicação assinada usa um workflow separado que valida versão, pacote, certificado e assets antes de criar a release.

Consulte `UPDATES.md` para o fluxo de atualização e assinatura.


## Atualizações automáticas

Ao abrir o jogo, Android e Windows consultam as releases do GitHub. Se existir uma versão com tag maior que a instalada, o jogo mostra uma confirmação antes de qualquer download: **"Sua versão está desatualizada. Baixar a versão mais recente agora?"**.

No Android, o APK oficial é baixado e verificado antes de abrir o instalador; atualização por cima exige a mesma assinatura. No Windows instalado pelo setup, o jogo baixa `DeadRecoil-Setup-<versão>.exe`, verifica o SHA-256 informado pelo GitHub, executa o instalador silencioso e reabre a nova versão.
