# Dead Recoil

Jogo de sobrevivência em primeira pessoa para Android e Windows, com ondas, mapas, classes, armas e controles próprios para cada plataforma.

## Jogar

### Android

Baixe `DeadRecoil.apk` na última release. A v0.8.0 já consulta novas releases automaticamente; quando a v9 assinada estiver publicada, ela detecta a nova versão, baixa o APK e pede apenas a confirmação do Android para instalar.

### Windows

Baixe `DeadRecoil-Windows.exe` na última release e execute diretamente. É uma versão portátil: não precisa de Node, navegador, `.bat` ou instalação obrigatória.

Controles principais: `WASD` para mover, mouse para mirar e atirar, `R` para recarregar, `Esc` para pausar e `F11` ou `Alt+Enter` para alternar tela cheia.

## Armory

O Armory usa dois tipos de spin. O Lucky Spin entrega somente Épico, Lendário ou Mítico. As raridades podem ser abertas para visualizar os itens disponíveis. Itens até Épico entram diretamente no loadout; Lendário e Mítico mostram uma única confirmação antes da troca.

## Builds

A `main` está preparada como v0.9.0. APKs/EXEs de QA são gerados para validação, mas a release Android só é publicada quando o APK usa a mesma assinatura da instalação estável anterior.

## Desenvolvimento

O jogo está em `android/app/src/main/assets/index.html`. O wrapper Android e o atualizador ficam em `android/app/src/main/java/com/deadrecoil/game/`. O runtime Windows fica em `desktop/`.

O workflow Android compila, testa os fluxos em vários tamanhos de tela e gera QA. A publicação assinada usa um workflow separado que valida versão, pacote, certificado e assets antes de criar a release.

Consulte `UPDATES.md` para o fluxo de atualização e assinatura.
