# Dead Recoil 0.35.0 — v40

Esta release consolida a correção completa pedida para economia, loadout, terceira pessoa, menus, origem de disparos, animações e estabilidade/performance, já sobre o HEAD final com o backend de produção alinhado.

## Economia
- Zumbi normal: 10 moedas.
- Rastejante: 10 moedas.
- SWAT: 50 moedas.
- Constructor/Dinamite: 50 moedas.
- Cyborg/Robot: 50 moedas.
- Spawn de qualquer boss ou miniboss: 10 moedas.
- Morte de miniboss: 500 moedas.
- Morte de boss: 1000 moedas.
- Onda concluída: 50 moedas.
- Recompensas determinísticas em cliente e servidor, sem multiplicar por dificuldade/headshot.
- Contabilidade de moedas do backend evita dupla soma de coins_earned.
- Recompensas e catálogos do Supabase de produção foram revalidados.

## Loadout e modelos 3D
- Angelic Specter exibe as cinco lâminas independentes no loadout.
- As cinco lâminas permanecem estáveis, sem jitter/tremor residual.
- Fallback de preview continua mostrando o conjunto completo antes do GLB terminar de carregar.
- Modelos de armas e sockets foram revisados para evitar peças tortas, de lado ou atravessando o jogador.
- Demonic Fury/foice fica orientada corretamente e afastada do corpo.

## Terceira pessoa, armas e animações
- Armas longas usam offsets/sockets próprios para não atravessarem tronco/quadril.
- Arcos ficam voltados para frente e com empunhadura correta.
- Melees longos usam orientação corrigida durante idle e ataque.
- Golpes não ficam invertidos/atacando para trás.
- Mãos e armas permanecem alinhadas durante caminhada, ataque e recarga.
- Flechas, tiros, tracers e projéteis saem do cano/ponta visível da arma, inclusive em modelos GLTF aninhados.
- Testes percorrem a geometria das armas em terceira pessoa e validam origem de projéteis.

## Menus e estabilidade
- Telas ocultas usam inert/aria-hidden e não mantêm foco antigo.
- Callbacks antigos de foco não conseguem reabrir ou sobrepor menus.
- Scroll é restaurado apenas na tela ativa.

## Performance
- Horda evita snapshots/arrays temporários por frame.
- Vetores de direção são reutilizados por inimigo.
- Torres não ordenam a horda inteira a cada frame e só procuram alvo quando podem atirar.
- Angelic Specter evita alocação de Vector3 por frame.
- Mantidos os limites adaptativos de horda para mobile/desktop e otimizações de clima/mapa.

## Validação
A publicação só é criada depois de passar syntax, UI, movimento, colisão/spawn, economia, armas, projéteis, terceira pessoa, bosses, segredos, Specter, multiplayer/dev safety, build Android e build Windows.
