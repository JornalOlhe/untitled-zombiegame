# Dead Recoil 0.34.0 — v39

Esta release fecha a rodada de economia, loadout, terceira pessoa, menus, origem de disparos e estabilidade visual.

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
- As recompensas continuam determinísticas: dificuldade e headshot não alteram esses valores.
- Testes agora exercitam os caminhos reais de kill, spawn de boss/miniboss e fechamento de onda, além do contrato SQL do backend.

## Loadout e Angelic Specter
- Angelic Specter mostra sempre as cinco lâminas no loadout, incluindo fallback antes do GLB terminar de carregar.
- Malhas das cinco lâminas ficam renderizáveis sem desaparecer por frustum culling.
- Movimento idle das lâminas foi reduzido e estabilizado para eliminar tremor/jitter.
- Primeiro plano da Specter também recebeu movimento mais suave e menos alocação por frame.

## Terceira pessoa e armas
- Colisão visual de armas longas com tronco/quadril ficou mais conservadora e usa amostragem mais densa.
- Demonic Fury recebeu posição/rotação própria para a foice ficar apontada corretamente e afastada do corpo.
- Braço livre da foice não cruza mais o cabo/lâmina durante combos.
- Arcos continuam verticais e voltados para frente.
- Rifles, arcos e demais armas usam sockets de mão e origem real do cano/ponta do modelo.
- Flechas, tiros, tracers e projéteis continuam saindo da arma visível.
- Teste de terceira pessoa percorre todas as armas em idle, caminhada, ataque e recarga e valida orientação, mãos, origem de projétil, penetração e Specter.

## Menus
- Telas escondidas passam a ficar inert e aria-hidden.
- Foco de controles é removido antes de esconder uma tela.
- Scroll horizontal e vertical são resetados somente na tela ativa.
- O epoch de navegação continua impedindo callbacks antigos de foco de reabrirem/bugarem menus.

## Performance e estabilidade
- Removida uma alocação Vector3 por frame da animação da Specter.
- A atualização da horda não cria mais uma cópia da lista inteira por frame; o vetor direção jogador→zumbi é reutilizado por inimigo.
- Torres só procuram alvo quando podem disparar e não criam mais arrays temporários com filter/sort da horda.
- Movimento visual da Specter foi simplificado sem remover as cinco lâminas independentes no gameplay.
- Mantidos os limites de horda adaptados para mobile e desktop e as otimizações de clima/mapa da v38.
- Suite de regressão cobre economia, replayability, UI, colisões, terceira pessoa, armas, projéteis, bosses, segredos e multiplayer.

## Observação de backend
O repositório contém a migração de economia com os mesmos valores desta release. A publicação do APK/EXE não substitui a aplicação de migrations no projeto Supabase de produção.
