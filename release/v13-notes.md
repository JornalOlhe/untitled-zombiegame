## Dead Recoil 0.13.0 QA

Esta release traz uma revisão completa dos modelos de zumbi e do arsenal, além de correções na roleta Lucky Spin.

### Zumbis e bosses
- Modelos de zumbis e chefes reconstruídos em estilo cúbico (blocky), mantendo animações e hitboxes intactas.

### Arma Mítica
- O projétil da Quantum Annihilator não persegue mais cegamente: ele só passa a seguir um zumbi se esse zumbi estava visível na câmera no instante do disparo; caso contrário, voa reto.

### Arma Divina
- Helios Lance agora é uma lança corpo a corpo: clique rápido é um golpe com alcance maior que o Machete; segurar o botão de ataque carrega e, ao soltar, arremessa a lança como projétil.

### Arsenal expandido e rebalanceado
- 21 armas no total, 3 por raridade (Comum → Divino), com tipos novos: fogo, gelo, arco e flecha e faca — cada uma com uma habilidade própria; Mítico e Divino têm duas habilidades.
- Curva de dano corrigida: nenhuma arma de raridade menor supera mais uma de raridade maior (o Anti-Material Rifle, antes Raro e com dano de até ~2000 com headshot/classe, foi rebalanceado).
- Lança-granadas substituído pela Bazooka, agora Lendária; nova Bazooka Celestial na Divina.
- Railgun Pulse (Lendária) perdeu a perfuração infinita e não atravessa mais paredes, ficando claramente abaixo de Mítico/Divino.
- Novos efeitos de status reutilizáveis: queimadura (dano contínuo), congelamento (lentidão) e roubo de vida, aplicados automaticamente por qualquer forma de dano.

### Lucky Spin
- Giro mais curto e o "quase Divino" resolve mais rápido, sem ficar parado perto da carta Divina por muito tempo.
- Celebração de vitória Divina agora é tela cheia de verdade (position fixed) e usa a cor real da raridade sorteada.

### Versões
- Android: versionCode 13 / versionName 0.13.0.
- Windows: versão 0.13.0.

Instalações com o atualizador de inicialização (v10+) detectam a tag v13 como uma versão mais recente e oferecem o asset `DeadRecoil-Windows.exe`.
