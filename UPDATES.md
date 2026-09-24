# Atualizações do Dead Recoil

O aplicativo consulta a última release estável de `JornalOlhe/untitled-zombiegame` ao abrir e, no retorno ao app, no máximo uma vez a cada 15 minutos. A tag `v8` corresponde ao `versionCode 8`. O anexo deve se chamar `DeadRecoil.apk`.

Na versão 0.8.0, uma versão mais recente inicia o download automaticamente e apresenta nome, novidades e progresso. O jogador pode adiar, tentar novamente ou instalar. O APK já verificado é reaproveitado se ainda estiver no cache. Sem internet, a versão instalada continua disponível. A confirmação de instalação é feita pelo Android.

## Publicação

Cada push na main executa testes da interface e compila o projeto. Depois, valida `release/DeadRecoil.apk` contra `release/manifest.json`: hash, versão, identidade, assinatura e todos os assets empacotados. Só publica após os dois jobs passarem. Uma versão já publicada nunca é sobrescrita.

Para uma nova atualização:
1. Aumente `versionCode` e `versionName` em `android/app/build.gradle`.
2. Compile o APK com a mesma chave privada usada nas versões anteriores.
3. Atualize `release/DeadRecoil.apk`, os campos de `release/manifest.json` e `release/notes.md`.
4. Envie para main. O workflow cria a release com o APK validado.

Alterar só o código não atualiza o APK já instalado. O pacote assinado precisa ser recompilado. A chave privada nunca deve entrar no repositório. O APK de teste gerado com a chave temporária do runner não é distribuído.
