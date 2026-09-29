# Dead Recoil 0.31.0

## Armas corpo a corpo
- **Machete, Bloodfang, Demonic Fury, Dawn Spear e Frostbite** refeitas no Blender com volume real (lâmina biselada, cabo, UV dos templates), vistas de frente/lado/costas/topo verificadas.
- **Mão esquerda** não segura Machete, Bloodfang ou Foice; só a lança usa as duas mãos.
- **Foice:** rastro sai da lâmina real (primeira e terceira pessoa), vermelho escuro demoníaco, mais longo nos golpes fortes.
- **Lança arremessada:** Segurar → Preparar → Mirar → Arremessar → Soltar → Voo → Retorno, com pose de dardo (quadril → ombro → cotovelo → pulso), uma única lança no ar e trajetória na mira.

## Chefes e mundo
- Passos dos chefes soam e levantam poeira exatamente no apoio do pé (Yeti, Demon, Prototype X, Juggernaut, Quarterback), com tremor proporcional à distância.
- Modelo legado de zumbi removido: todos usam os templates voxel.

## Modo desenvolvedor
- Console em **10 abas**: PLAYER, WEAPONS, CLASSES, ZOMBIES, BOSSES, MAPS, WAVES, ECONOMY, DEBUG, PERFORMANCE.
- Variante de mapa dos zumbis, repetir intro / testar morte de chefe, teste de estresse e métricas ao vivo.
- **Debug de combate:** arco de acerto melee, raio de mira, raios de fogo/gelo, linha até o alvo, parede bloqueando e hitboxes.

## Economia
- **Pity:** Normal Spin +1, Lucky Spin +2. **Mítico garantido em 75, Divino em 150, Secreto em 300** (armas e classes separadas). Mítico reseta o Mítico, Divino reseta Divino + Mítico, Secreto reseta todos. Vale no cliente e no servidor.

## Regressões cobertas
spear, spawn, devmode, boss-audio, tp, melee, wall, projectiles, weapons, secret, pursuit, movement, intro, cyborg, ui (incluindo pity).
