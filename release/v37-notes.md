# Dead Recoil 0.32.0 — v37

Inclui tudo o que estava preparado para a 0.31.3 (v36, que não chegou a ser publicada) e a passada de produção da branch `work`.

## Spin em 3D real
- Palco do Spin refeito em 3D: fundo volumétrico com fumaça, luz principal + luzes de contorno coloridas que modelam o personagem e uma aura de chamas na cor da raridade do item.
- A explosão da revelação agora é geometria 3D de verdade: raios de luz atrás do personagem (ele os encobre), onda de choque, faíscas com arrasto e gravidade, relâmpagos e brilhos em profundidade; o personagem é iluminado pela cor da raridade. Timing continua o do vídeo de referência.

## Classes secretas
- **Heavenly Flight / Infernal Flight** ganharam animação própria: antecipação (agacha, asas sobem / cauda se enrola), decolagem suave, explosão de luz ou brasas, câmera com mergulho e FOV, pose de tronco/pernas/braços em 3ª pessoa.
- **Archdemon:** o antigo giro de saca-rolhas da cauda foi substituído por enrolar → chicotada → onda de natação no voo, tudo pelas vértebras com inércia.

## Armas e mãos
- Perfis de empunhadura por tipo de arma (1ª e 3ª pessoa) com transição ao trocar de arma.
- Lança: mãos seguem o cabo durante as estocadas; foice e lança não atravessam mais o corpo.
- **Angelic Specter:** rastros de luz angelicais, brilho por lâmina e impacto com flash, estrela e anel.

## Mapas
- **Hospital e Lab:** sistema de luminárias no teto (algumas queimadas ou piscando), poças de luz no chão e nas paredes, paredes pintadas, corrimãos, batentes de porta, iluminação ajustada; poças químicas orgânicas no Lab.
- Vento por mapa (Neve com rajadas fortes), vegetação sem “pop” no limite de distância, iluminação da Neve e pintura de rua da Cidade revisadas.
- Flechas presas no alto da parede não atravessam mais o teto.
- Depth of field acompanha o alvo no kill cam, na morte de boss e na própria morte.

## Desempenho
- Luzes dos mapas passam por um pool fixo por qualidade (4/6/10/16): menos custo por pixel em Baixo/Médio.
- Mapas fechados não renderizam mais a passada de sombra do sol (≈480 → ≈140 draw calls no Hospital em Médio).

## Android e assinatura
A release só publica se o APK instalar e emitir `DEAD_RECOIL_READY 0.32.0` num emulador Android. Sem os secrets de assinatura, é publicado `DeadRecoil-v37-manual.apk` (pode exigir reinstalação manual única).
