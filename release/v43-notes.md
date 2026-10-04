# Dead Recoil 0.38.0 — v43

Release de acabamento de gameplay, interface e estabilidade sobre a v42.

- Economia definitiva: zumbi normal/rastejante = 10 moedas; SWAT/Constructor(Dinamite)/Cyborg(Robot) = 50; aparição de boss ou miniboss = 10; miniboss = 500; boss = 1000; onda concluída = 50. Cliente e persistência Supabase seguem a mesma tabela.
- Multiplayer: eliminado o ciclo de reconexão do host causado por eventos de canais Realtime antigos; heartbeats do lobby também são serializados para não se sobreporem durante a partida.
- Loadout/terceira pessoa: Angelic Specter mantém cinco lâminas independentes e estáveis; Demonic Fury/foice, arcos e melees tiveram orientação/sockets preservados; armas não atravessam o tronco nos golpes testados e projéteis/tracers partem do muzzle real da arma em 1ª/3ª pessoa.

- Economia em partida: recompensas continuam nos valores definidos e agora aparecem imediatamente no HUD mesmo em contas autenticadas, sem transformar o saldo local em fonte autoritativa.
- Missões únicas: removidos os filtros de período/status; todas ficam visíveis, resgatadas vão para o fim e agora têm estado visual verde/bem marcado em vez de apenas cinza.
- Missões em telas pequenas: contadores e barras foram ajustados para números grandes caberem em landscape/mobile.
- Modos de jogo: cards explicam de forma clara o que muda no Clássico, Infinito e Contra o Tempo, com hover/seleção mais legíveis.
- Crawlers: postura e hitbox visual ficaram mais baixas e próximas do corpo rastejante.
- Barris explosivos: hitscan, flechas, mísseis/projéteis, lança-chamas, lança-gelo e melee agora interagem com props explosivos respeitando paredes.
- Props e escadas: props dinâmicos nascem no piso real; escadas têm estado de subida/descida, saída suave no telhado e pose própria em terceira pessoa, sem duplicar a altura do avatar.
- Performance: raycasts contra props reutilizam um cache de meshes em vez de alocar um array novo a cada tiro/stream.
- Loja/Customize: showroom 3D ampliado, rotacionável por mouse/toque, catálogo visual em cards e destaque do item atualmente em exibição antes de comprar/equipar.
- Personagem base: visual sem camiseta refinado a partir da referência enviada, cabelo preto irregular, calça cargo escura com bolsos/straps e tênis escuro com sola clara, usado tanto no jogo quanto no showroom.
- City: removidos os grandes paredões/blocos de tijolo vermelho nas bordas; barricadas, limite físico e skyline continuam fechando a área sem criar uma muralha visual artificial.
- Mantidas as correções da v42 para terceira pessoa, sockets/armas, Angelic Specter com cinco lâminas, Demonic Fury, arcos, asas/cauda e estabilidade das ondas.

A publicação é bloqueada até a árvore de gameplay passar a suíte completa, o APK iniciar no emulador e o instalador Windows instalar/abrir em smoke test.
