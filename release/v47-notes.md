# Dead Recoil 0.42.0 — v47

Correções de jogabilidade e persistência após a v46.

- **Paredes invisíveis:** peças estáticas rotacionadas deixam de receber um único AABB grande. Colisores diagonais agora são segmentados para acompanhar melhor a geometria visível e remover cantos invisíveis que prendiam o jogador.
- **Escadas:** um novo toque no pulo durante a subida agora solta o jogador da escada com impulso para cima e para fora da parede, com curto bloqueio de reagarre. O Space não fica mais sequestrado pelo estado de climb.
- **Economia gameplay → lobby:** recompensas exibidas durante a partida só são marcadas como confirmadas na proporção do aumento que o servidor realmente persistiu.
- **Confirmação parcial:** se o HUD mostra 6.000 a partir de 4.000 + 2.000 ganhos e o servidor primeiro confirma apenas 5.000, o saldo ao vivo continua 6.000 com 1.000 pendente; uma resposta antiga de perfil/lobby não derruba a carteira.
- **Gastos continuam autoritativos:** compras reais ainda podem reduzir o saldo normalmente.
- **Respostas sem gasto:** refresh de sessão, preferências e perfil usam reconciliação que protege o saldo contra snapshots antigos sem transformar recompensa otimista em dinheiro confirmado.
- **Testes de regressão:** ladder jump-off, colisor diagonal sem canto invisível e carteira 4k → 6k → confirmação parcial → lobby → confirmação final.

### Versões
- Android: versionCode 47 / versionName 0.42.0.
- Windows: 0.42.0.
