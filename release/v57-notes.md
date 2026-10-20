# Dead Recoil 0.51.1 Alpha — v57

Correções de desempenho, travamentos e jogabilidade encontradas jogando a Alpha.

- **Menos travamento e crash:** o fundo do menu não monta mais um mapa novo a cada 16 s (isso travava por segundos e acumulava as texturas de todos os mapas na memória); agora ele alterna ângulos de câmera no mesmo mapa.
- **Mapas mais leves:** peças paradas do cenário (janelas, batentes, acabamentos) são desenhadas juntas — no Hospital, cerca de 30% menos trabalho por quadro.
- **Menos engasgos no meio da partida:** os efeitos (números de dano, brilhos) são preparados antes da partida e a checagem de erro de shader saiu da versão final, o que tirava o "engasgo" no primeiro abate.
- **Entrar no jogo:** ao tocar num mapa ele já começa a carregar no fundo, e a partida mostra uma tela de **CARREGANDO** em vez de congelar.
- **Ritmo das ondas:** os zumbis surgem a 16–40 m de você (antes vinham do ponto mais distante do mapa e levavam ~40 s para chegar).
- **Munição:** as armas começam com a reserva cheia; se todas as armas secarem e não houver caixa no mapa, uma caixa dourada aparece na hora; caixas surgem mais rápido quando você está com pouca munição.
- **Loadout:** o personagem fica de 3/4 e a arma aparece na mão (antes ficava apontada para a câmera, escondida pelos braços).
- **Tela JOGAR:** os cartões dos mapas ficam por cima do mapa 3D ao vivo.

### Versões
- Android: versionCode 57 / versionName 0.51.1.
- Windows: 0.51.1.
