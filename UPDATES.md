# Atualizações do Dead Recoil

O aplicativo Android consulta a última release estável de `JornalOlhe/untitled-zombiegame` ao abrir e, no retorno ao app, no máximo uma vez a cada 15 minutos.

A versão 0.8.0 usa `versionCode 8` e já contém o atualizador automático. Quando a release `v9` existir com um anexo chamado exatamente `DeadRecoil.apk`, a v0.8.0 detectará `versionCode 9`, baixará o APK e validará pacote, versão e assinatura antes de permitir a instalação.

A atualização só é aceita quando o APK novo usa a mesma assinatura da versão instalada. Isso permite instalar por cima da v8 mantendo os dados locais e impede que um APK assinado por outra chave seja aceito.

## Estado da v9

A `main` usa `versionCode 9` e `versionName 0.9.0`.

A release `v9` só deve ser criada depois que o APK 0.9.0 for assinado com a mesma chave privada usada na v8. O workflow `Publish signed Android release` faz essa verificação antes de publicar.

## Publicação assinada

O workflow manual de release espera estes GitHub Actions secrets:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_KEYSTORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

Ele compila o APK de release, assina com a chave fornecida, valida o certificado contra a assinatura conhecida da release estável, confere versão/pacote/assets e só então cria a release `v9` com `DeadRecoil.apk`.

A chave privada nunca deve ser adicionada ao repositório.

## QA

Cada push na `main` continua executando os testes de interface e gerando APK/EXE de QA. Builds de QA não substituem uma release assinada e não devem ser distribuídas como atualização para instalações existentes.
