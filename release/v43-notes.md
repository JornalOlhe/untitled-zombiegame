# Dead Recoil 0.38.0 — v43

Release de acabamento de gameplay, interface e estabilidade sobre a v42.

- Economia em partida: recompensas continuam nos valores definidos e agora aparecem imediatamente no HUD mesmo em contas autenticadas, sem transformar o saldo local em fonte autoritativa.
- Missões únicas: removidos os filtros de período/status; todas ficam visíveis, resgatadas vão para o fim e agora têm estado visual verde/bem marcado em vez de apenas cinza.
- Missões em telas pequenas: contadores e barras foram ajustados para números grandes caberem em landscape/mobile.
- Modos de jogo: cards explicam de forma clara o que muda no Clássico, Infinito e Contra o Tempo, com hover/seleção mais legíveis.
- Crawlers: postura e hitbox visual ficaram mais baixas e próximas do corpo rastejante.
- Barris explosivos: hitscan, flechas, mísseis/projéteis, lança-chamas, lança-gelo e melee agora interagem com props explosivos respeitando paredes.
- Props e escadas: props dinâmicos nascem no piso real; tolerância de degrau foi ajustada para reduzir travadas/noclip em escadas e pequenos desníveis.
- Performance: raycasts contra props reutilizam um cache de meshes em vez de alocar um array novo a cada tiro/stream.
- Loja/Customize: cards de cosméticos agora mostram prévia 3D real no personagem; o modelo pode ser girado com mouse/toque antes de comprar/equipar.
- Personagem base: visual sem camiseta refinado, braços/torso com material de pele e calça cargo/sapato com mais detalhe, mantendo as camadas de classe e cosméticos.
- Mantidas as correções da v42 para terceira pessoa, sockets/armas, Angelic Specter com cinco lâminas, Demonic Fury, arcos, asas/cauda e estabilidade das ondas.

A publicação é bloqueada até a árvore de gameplay passar a suíte completa, o APK iniciar no emulador e o instalador Windows instalar/abrir em smoke test.
