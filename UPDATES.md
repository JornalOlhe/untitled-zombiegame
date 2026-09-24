# Atualizações no Android

A versão 0.7.0 (versionCode 7) consulta, na abertura, a versão pública mais recente em:
https://api.github.com/repos/JornalOlhe/untitled-zombiegame/releases/latest

Para ativar uma atualização futura:
1. Mantenha o mesmo `applicationId` (`com.deadrecoil.game`) e aumente o `versionCode`.
2. Assine o novo APK com **a mesma chave usada nos APKs 0.5, 0.6 e 0.7**. Ela é entregue separadamente e não faz parte deste ZIP. Não coloque o arquivo `.keystore` no repositório público.
3. Publique uma GitHub Release estável com a tag `v8` para `versionCode 8`, `v9` para 9 etc. Anexe nela um APK com o nome exato `DeadRecoil.apk`. Uma release draft ou prerelease não aparece em `/releases/latest`.
4. No próximo início conectado à internet, o jogo oferece o download e verifica versão, identidade do app, certificado e digest SHA-256 (quando fornecido pelo GitHub).
5. O Android pode pedir autorização para o app instalar APKs e sempre apresenta a tela de confirmação da instalação.

A versão 0.7.0 é a primeira que contém o atualizador. APKs anteriores precisam ser atualizados uma vez pelo link. A assinatura atual vem de uma chave de desenvolvimento; antes de distribuir amplamente, defina uma política de custódia e migração para uma chave de publicação. Trocar a chave sem rotação válida impede a atualização sobre instalações existentes.

Nota: o workflow incluído no ZIP ainda é um build de teste. Ele gera um APK com uma chave de debug diferente em cada runner e não deve ser publicado como atualização. Configure a assinatura com uma chave permanente antes de automatizar releases.
