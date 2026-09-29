# Dead Recoil 0.31.2

## Dawn Spear — hotfix visual/físico
- A Dawn Spear agora **sai realmente da mão no exato frame do arremesso**.
- Enquanto a lança está indo até o alvo ou retornando, **não existe segunda lança na mão**.
- O bloqueio vale tanto para o viewmodel em **1ª pessoa** quanto para o personagem em **3ª pessoa**.
- O CameraRig não pode mais religar o modelo da lança em 1ª pessoa durante o voo.
- A lança só reaparece no socket da mão quando **a mesma lança física é capturada no retorno**.
- Ataques continuam bloqueados durante ida/retorno e são liberados imediatamente após a captura.

## Regressão
- Teste da Spear agora verifica simultaneamente:
  - no máximo 1 projétil Spear;
  - zero frames com Spear duplicada na mão em 1ª pessoa;
  - zero frames com Spear duplicada na mão em 3ª pessoa;
  - nenhum ataque carregado/registrado enquanto ela está fora;
  - reaparecimento da Spear nas duas câmeras após o retorno;
  - ataque funcionando imediatamente após a captura;
  - parede bloqueando a lança corretamente.

## Mantido da 0.31.1
- Bunny hop por botão segurado.
- Air steering relativo à câmera.
- Correção de paredes invisíveis causadas por colliders elevados.
- Moedas garantidas por kill e bônus pequeno por onda.
- Locks/easing revisados das animações melee.
