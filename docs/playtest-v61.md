# Playtest v60 → v61 (22/10/2026)

Bot jogando História nível 1 nos 5 mapas (640×360 e 960×540), Infinito na cidade, e telas de menu, loja, pausa e fim de partida.

## Já está bom
- Loop de onda → "ONDA LIMPA" → "B abre a loja" → próxima onda é claro e recompensa rápido (moedas + Essência a cada onda).
- Feedback de acerto/abate (marcador, números, cambaleio, câmera lenta em 5 abates) e morte com câmera lenta.
- Atualização da lógica estável (≈3–5 ms por quadro) com 5–10 zumbis.
- Menus, Missões, Configurações, Personalizar e Loadout coerentes na paleta nova.

## Problemas encontrados → corrigido na v61
1. **Infinito tinha chefe/mini-chefe em TODA onda**, desde a onda 1 (o aviso dizia sempre "Movimento anormal detectado"). Chefe deixava de ser evento. → Agora: mini-chefes nas ondas 5, 15, 25…, e a cada 3 ondas depois da 10; chefes grandes na 10 e na 20 (padrão repete).
2. **Cartão da arma no HUD gigante e no meio da tela** em janelas pequenas (até 720 px): esticava até a altura da vida. → Fica compacto no canto direito em qualquer tamanho.
3. **"ONDA X" em cima da mira**: o subtítulo passava pela mira. → Faixa mais alta e um pouco menor.
4. **Arco em 1ª pessoa ocupava metade da tela**, em pé do lado direito. → Mais baixo, inclinado e com a flecha apontando para a mira.
5. **Mesma missão em todos os mapas** ("Religue os geradores"). → Texto próprio por mapa (energia de emergência no hospital, acampamento na floresta, núcleos no laboratório, base congelada no ártico).
6. **Sem explicação de controles** depois que "Como jogar" saiu do menu. → Nas 3 primeiras partidas aparece um cartão com os controles (as teclas que o jogador configurou), que some sozinho em ~9 s.
7. **Grama da floresta alta demais** escondendo zumbis próximos. → Grama mais baixa.
8. **Minimapa azulado/pouco visível** (paredes do hospital quase sumiam). → Paredes em cinza quente, mais contrastado.

## Observado, ainda não mexido
- Munição: atirando muito (spray), a reserva do MP5 acaba por volta da onda 3–4; caixas douradas e "Munição máxima" compensam. Vale observar com jogadores reais antes de mexer no balanço.
- Floresta continua muito escura para alguns monitores (há controle de brilho nas Configurações).
- Desenho do mapa: a cidade passa de 450 draw calls em alguns ângulos — candidato a otimização futura.
- Um travamento longo no início da onda 3 apareceu duas vezes no ambiente de teste (renderização por software), mas não se repetiu numa terceira rodada isolada; não confirmado.
