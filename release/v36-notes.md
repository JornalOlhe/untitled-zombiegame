# Dead Recoil 0.31.3 — v36

## Correções críticas
- **Dawn Spear:** ao arremessar, a lança física sai imediatamente da mão em 1ª e 3ª pessoa. Nenhuma segunda lança aparece; ataque fica bloqueado até a mesma lança retornar e ser capturada.
- **Bunny hop:** segurar pulo repete o salto automaticamente ao tocar o chão; direção aérea responde ao yaw/câmera e ao input atual sem perder o limite de velocidade.
- **Colisões:** objetos elevados não criam mais paredes invisíveis do chão ao teto.
- **Economia:** kills e ondas usam recompensa baixa/garantida, com testes de regressão.
- **Boot Android:** cache antigo do WebView é descartado, erros de boot ficam visíveis e crash do renderer é tratado.
- **Teste real de abertura:** a release só publica se o APK instalar e emitir `DEAD_RECOIL_READY 0.31.3` em um emulador Android.

## Conteúdo da branch work incluído
- Spin HUD reconstruído com o vídeo de referência como blueprint.
- Modelos melee HD e coreografia revisada.
- Angelic Specter com 5 lâminas independentes.
- Asas do Archangel, cauda do Archdemon, natureza/vento, céus, teto físico dos mapas fechados e depth-of-field.

## Android e assinatura
As releases recentes foram publicadas com assinatura **debug temporária** porque os GitHub Secrets de assinatura não estão configurados. Isso impede atualização in-place confiável entre APKs.

Na v36:
- se uma chave de release estável estiver configurada, a release publica `DeadRecoil.apk` e o updater instala automaticamente;
- se a chave continuar ausente, a release publica `DeadRecoil-v36-manual.apk` e o jogo abre a página da release em vez de tentar instalar automaticamente um APK incompatível.

Nesse segundo caso, pode ser necessária uma reinstalação manual única do Android.
