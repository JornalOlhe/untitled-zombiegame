# Dead Recoil 0.47.0 — v52

Acabamento visual e estabilidade: facas realmente presas à mão, explosões mais físicas e gráficos mais nítidos sem abandonar os limites de performance.

- **Machete e Bloodfang:** repouso reto na mão, socket deslocado para fora do torso e grip alinhado ao cabo; removida a inclinação que fazia a lâmina atravessar personagem/mão.
- **Mãos:** armas de uma mão agora mostram dedos quadrados segmentados envolvendo o cabo em primeira e terceira pessoa.
- **Explosões:** rajada radial de núcleo quente, fumaça, flash de luz e onda de choque; buffers e pools fixos evitam picos em explosões em cadeia.
- **Barris:** explosões vermelhas e tóxicas usam o mesmo sistema radial/onda de choque mantendo limites de detritos, partículas e luzes.
- **Fogo:** fumaça com deriva tridimensional sem novos emissores.
- **Texturas:** armas HD usam anisotropia adaptativa ao preset/GPU, com limite menor no Android.
- **Reflexos:** poças continuam com espelho planar da cena completa; Android continua limitado ao preset Médio para proteger desempenho.
- **Regressões:** testes verificam dedos no grip, Machete/Bloodfang sem diagonal/interpenetração e pool fixo das ondas de choque.

### Versões
- Android: versionCode 52 / versionName 0.47.0.
- Windows: 0.47.0.
