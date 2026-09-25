# Atualizações do Dead Recoil

Android e Windows consultam as releases de `JornalOlhe/untitled-zombiegame` quando o jogo abre. Uma tag numericamente maior que a versão instalada é tratada como atualização disponível.

## Estado atual

- v9: última release Android estável assinada com `DeadRecoil.apk`.
- v10: build QA que introduziu o fluxo de atualização na inicialização para Android e Windows.
- v11: build QA com a nova roleta de suspense, near-miss visual e animação Divina; Android usa `versionCode 11` / `0.11.0` e Windows usa `0.11.0`.

No Windows, a v10 compara a versão do executável com as tags `vN` publicadas. Quando `v11` estiver disponível, o jogo informa que a versão instalada está desatualizada e oferece o download do asset `DeadRecoil-Windows.exe`.

No Android, uma atualização por cima só pode ser instalada quando o APK novo usa a mesma assinatura do aplicativo instalado. Releases QA/prerelease podem abrir o asset oficial no GitHub quando a assinatura não permite instalação automática.

## Publicação assinada

O workflow de release Android estável utiliza estes GitHub Actions secrets:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_KEYSTORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

A chave privada nunca deve ser adicionada ao repositório.

## QA

Cada push na `main` executa testes de interface e gera builds de validação. A v11 também possui um workflow dedicado que testa a UI, compila Android/Windows e publica a prerelease somente quando todos os jobs passam.
