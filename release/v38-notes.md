# Dead Recoil 0.33.0 — v38

Esta release fecha a rodada de correções de multiplayer, economia, clima, desempenho, loadout e animações/posicionamento de armas.

## Economia
- Zumbi normal: 10 moedas.
- Rastejante: 10 moedas.
- SWAT: 50 moedas.
- Dinamite/Constructor: 50 moedas.
- Robot/Cyborg: 50 moedas.
- Spawn de qualquer boss ou miniboss: 10 moedas.
- Morte de miniboss: 500 moedas.
- Morte de boss: 1000 moedas.
- Onda concluída: 50 moedas.
- Recompensas de onda ficaram idempotentes para não sumirem nem duplicarem em resync.
- Multiplayer recupera o tally autoritativo depois de reconectar.
- Migração SQL correspondente adicionada para persistência server-side.

## Multiplayer
- Corrigido o loop em que o host podia ficar entrando em Reconectando durante a partida.
- Canais antigos do Supabase Realtime não conseguem mais disparar nova reconexão depois de terem sido substituídos.
- Heartbeats do lobby não sobrepõem chamadas anteriores.
- Migração de host usa a mesma janela de 45 s da remoção de jogador inativo, evitando promoção prematura durante loading/travadas temporárias.
- Estado de recompensas/tally é reaplicado após reconexão.

## Armas, loadout e terceira pessoa
- Angelic Specter agora mostra as 5 lâminas no preview/loadout.
- Eliminado o tremor residual das lâminas quando entram em repouso.
- Perfis de empunhadura revisados por família de arma.
- Arcos ficam orientados para a frente em vez de atravessados/de lado.
- Foice Demonic Fury corrigida para não ficar invertida na mão.
- Melees longos recebem correção contra interseção com tronco/quadril.
- Rifles e arcos usam sockets de mão próprios em terceira pessoa.
- Origem de projéteis, tiros e tracers passa a usar o cano/ponta real do modelo, inclusive em modelos GLTF aninhados.
- Arcos soltam a flecha a partir do ponto visível da arma.
- Ataques melee em terceira pessoa foram realinhados para seguir a orientação correta da arma.

## Menus
- Corrigida corrida de foco entre telas que podia deixar menus em estado visual inconsistente.
- Troca de tela agora invalida callbacks de foco antigos e restaura scroll somente na tela ativa.

## Clima e gráficos
- Chuva somente em City e Dark Forest.
- Snow mantém o sistema próprio de neve.
- Hospital e Underground Lab ficam sem chuva.
- Poças climáticas usam InstancedMesh e lifecycle de mapa correto.
- Reflexos Off/Low/High integrados às configurações, com caminho de custo reduzido no Android.

## Desempenho e estabilidade
- Buffers de clima são reutilizados entre trocas de mapa.
- Geometrias/materiais descartáveis do mapa são liberados corretamente no rebuild.
- Pool de spawn é pré-calculado por onda, reduzindo alocações no hot path.
- Limpeza de hit meshes evita recriar arrays inteiros em mortes.
- Suite de regressão ampliada para movimento, colisão, armas, projéteis, terceira pessoa, bosses, Specter e multiplayer.

## Android
A publicação valida o APK, confere que os assets correspondem exatamente ao commit e executa boot real em emulador. Se a assinatura estável não estiver disponível, a release publica DeadRecoil-v38-manual.apk; nesse caso pode ser necessária reinstalação manual.
