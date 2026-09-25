# Dead Recoil

Jogo de sobrevivência em primeira pessoa para Android e Windows, com ondas, mapas, classes, armas e controles próprios para cada plataforma.

## Jogar

### Android

Baixe `DeadRecoil.apk` na última release. A partir da versão 0.7.0 o app consulta novas releases. A versão 0.8.0 mostra as novidades e baixa automaticamente; a instalação é confirmada no Android.

### Windows

Baixe `DeadRecoil-Windows.exe` na última release e execute diretamente. É uma versão portátil: não precisa de Node, navegador, `.bat` ou instalação obrigatória.

Controles principais: `WASD` para mover, mouse para mirar e atirar, `R` para recarregar, `Esc` para pausar e `F11` ou `Alt+Enter` para alternar tela cheia.

## Armory

O Armory usa dois tipos de spin. O Lucky Spin entrega somente Épico, Lendário ou Mítico. As raridades podem ser abertas para visualizar os itens disponíveis. Itens até Épico entram diretamente no loadout; Lendário e Mítico mostram uma única confirmação antes da troca.

## Builds

A release pública continua sendo a versão estável assinada. Mudanças mais novas da `main` são geradas como artifacts de QA para Android e Windows; a release estável só é atualizada quando o APK assinado corresponde exatamente ao código atual.

## Desenvolvimento

O jogo está em `android/app/src/main/assets/index.html`. O wrapper Android e o atualizador ficam em `android/app/src/main/java/com/deadrecoil/game/`. O runtime Windows fica em `desktop/`.

O workflow Android compila, testa os fluxos em três tamanhos de tela e verifica o APK assinado antes de publicar. O workflow Windows testa o runtime Electron, gera um executável portátil x64 e anexa `DeadRecoil-Windows.exe` à release da mesma versão.

Consulte `UPDATES.md` para preparar uma próxima versão.
