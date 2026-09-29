# Dead Recoil 0.31.1

## Movimento
- **Bunny hop por botão segurado:** segurar Space no PC ou o botão de pulo no mobile faz o personagem pular novamente no primeiro frame em que toca o chão.
- **Direção no ar corrigida:** a direção desejada é recalculada todo frame usando o yaw atual da câmera + WASD/joystick; virar enquanto pula agora curva a trajetória em vez de manter o vetor antigo.
- **Momentum controlado:** o air steering preserva a maior parte da velocidade, mas continua preso ao hard cap do bunny hop para evitar aceleração infinita.

## Física dos mapas
- Corrigidos colliders elevados que podiam virar **paredes invisíveis do chão ao teto**, principalmente props de telhado/HVAC.
- Objetos agora carregam base + topo do collider e só bloqueiam quando o corpo do jogador realmente ocupa a mesma faixa vertical.
- Objetos reais no chão continuam com colisão e obstáculos baixos continuam escaláveis.

## Economia
- Todo zumbi creditado ao jogador concede moedas em **100% das kills**.
- Kill normal usa recompensa baixa; headshot dá um pouco mais.
- Cada onda concluída concede um bônus pequeno e crescente, mantendo a progressão deliberadamente lenta.
- Inclui a migration `20260929103000_guaranteed_coin_rewards.sql` para alinhar persistência do backend quando aplicada ao Supabase de produção.

## Spear e melee
- A Dawn Spear agora é tratada como **uma única lança física**: durante voo/retorno, ataques, cargas e outra lança na mão ficam bloqueados.
- O ataque é liberado imediatamente quando a mesma lança retorna.
- Ataques melee ganharam easing mais suave e lock de animação para evitar reinício/interrupção no meio do golpe.

## Spin
- Mantidas as mudanças da branch de produção: flicker do nome seguindo a cadência medida no vídeo, quase-acerto antes do resultado, modelo final aparecendo apenas no reveal e flash de tela cheia por raridade.

## QA
- Movimento/colisão.
- Hold-to-bhop.
- Air steering a 90° preservando momentum.
- Hard cap de bunny hop.
- Economia/coins.
- Melee.
- Spear throw/return.
- Terceira pessoa.
