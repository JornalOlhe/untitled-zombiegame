# Dead Recoil

Jogo de sobrevivência em primeira pessoa para Android, com ondas, mapas, classes, armas e controles por toque.

## Jogar

Baixe `DeadRecoil.apk` na última release. A partir da versão 0.7.0 o app consulta novas releases. A versão 0.8.0 mostra as novidades e baixa automaticamente; a instalação é confirmada no Android.

## Desenvolvimento

O jogo está em `android/app/src/main/assets/index.html`; o wrapper e o atualizador em `android/app/src/main/java/com/deadrecoil/game/`.

O workflow compila o código, testa os fluxos em três tamanhos de tela e verifica o APK assinado antes de publicar. Consulte `UPDATES.md` para preparar uma próxima versão. Capturas dos testes ficam nos artifacts do workflow.
