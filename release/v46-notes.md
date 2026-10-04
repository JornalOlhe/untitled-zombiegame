# Dead Recoil 0.41.0 — v46

Hotfix de estabilidade focado em explosões, barris e picos de desempenho.

- **Explosões mais estáveis:** debris passam a ter limite por plataforma/qualidade, evitando crescimento excessivo durante cadeias de explosões.
- **Menos picos de VFX:** partículas de explosão escalam conforme dispositivo e qualidade sem alterar dano, alcance ou lógica da explosão.
- **Áudio reutilizado:** efeitos de ruído passam a reutilizar buffers de áudio curtos em vez de alocar um novo buffer a cada tiro/explosão, reduzindo pressão de memória e garbage collection.
- **Cadeias de barris:** o áudio de explosões simultâneas é agrupado para evitar dezenas de nós de áudio no mesmo instante.
- **Debris corrigidos:** fragmentos metálicos de barris não geram mais efeitos de sangue repetidamente ao tocar o chão e debris são limpos ao trocar/reiniciar mapa.
- **Barris verdes/toxic:** todos os caminhos de arma usam a posição física atual do prop no mesmo frame. Barris que rolaram ou tombaram não ficam mais com hitbox antiga e deixam de ignorar tiros.
- **Teste de regressão:** todas as armas agora são testadas contra barris vermelhos e verdes, inclusive após movimento/tombamento.
- **Stress test:** uma cadeia artificial de 30 barris verifica limites de debris, partículas e flash lights sem deixar explosivos presos ou gerar erro de página.

### Versões
- Android: versionCode 46 / versionName 0.41.0.
- Windows: 0.41.0.
