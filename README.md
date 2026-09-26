# Dead Recoil

Jogo de sobrevivência em primeira pessoa para Android e Windows, com ondas, mapas, classes, armas e controles próprios para cada plataforma.

## Jogar

### Android

Baixe `DeadRecoil.apk` na última release. A v0.8.0 já consulta novas releases automaticamente; quando a v9 assinada estiver publicada, ela detecta a nova versão, baixa o APK e pede apenas a confirmação do Android para instalar.

### Windows

Baixe `DeadRecoil-Windows.exe` na última release e execute diretamente. É uma versão portátil: não precisa de Node, navegador, `.bat` ou instalação obrigatória.

Controles principais: `WASD` para mover, mouse para mirar e atirar, `R` para recarregar, `Esc` para pausar e `F11` ou `Alt+Enter` para alternar tela cheia.

## Armory

O Armory usa dois tipos de spin. O Normal Spin custa 50 moedas e soma +1 nos pities; o Lucky Spin tem custo base de 250 moedas, soma +2 e entrega somente Épico, Lendário, Mítico ou Divino: 59% / 37% / 3% / 1%. Armas e classes possuem pities separados: 75 garante Mítico ou Divino no próprio giro que atinge o limite, e 150 garante Divino. Um Mítico reseta apenas o pity Mítico; um Divino reseta os dois. A roleta mantém a sequência longa, near-miss visual e encaixe final no centro sem alterar o resultado real. Todos os resultados entram diretamente no loadout e resultados Divinos recebem uma celebração própria. O único aviso acontece antes de um novo giro quando o item equipado é Mítico ou Divino.

## Builds

A `main` está preparada como v0.12.0 QA. A v11 publica EXE portátil para Windows e APK de QA para Android; a release Android estável continua exigindo a mesma assinatura da instalação estável anterior.

## Desenvolvimento

O jogo está em `android/app/src/main/assets/index.html`. O wrapper Android e o atualizador ficam em `android/app/src/main/java/com/deadrecoil/game/`. O runtime Windows fica em `desktop/`.

O workflow Android compila, testa os fluxos em vários tamanhos de tela e gera QA. A publicação assinada usa um workflow separado que valida versão, pacote, certificado e assets antes de criar a release.

Consulte `UPDATES.md` para o fluxo de atualização e assinatura.


## Atualizações automáticas

Ao abrir o jogo, Android e Windows consultam as releases do GitHub. Se existir uma versão com tag maior que a instalada, o jogo mostra uma confirmação antes de qualquer download: **"Sua versão está desatualizada. Baixar a versão mais recente agora?"**.

No Android, releases estáveis com o asset `DeadRecoil.apk` são baixadas e verificadas dentro do app antes de abrir o instalador. Releases QA/prerelease abrem o asset oficial no GitHub, pois o Android só permite atualização por cima quando a assinatura é a mesma. No Windows, o botão abre diretamente o `DeadRecoil-Windows.exe` da release mais recente.
