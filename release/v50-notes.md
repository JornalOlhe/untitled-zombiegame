# Dead Recoil 0.45.0 — v50

Atualização visual, de controle, animação e áudio, mantendo as correções e os modos da v49.

- **Personagem base remodelado:** a skin enviada pelo projeto foi convertida para um UV de alta resolução e aplicada ao survivor em jogo, mantendo o modelo em blocos e as roupas/cabelo da referência.
- **Controle completo:** suporte a gamepads padrão no gameplay e nos menus, com sensibilidade de analógico configurável.
- **Chuva e reflexos:** poças molhadas com reflexo do cenário e ondulações; no Android a qualidade de reflexo continua limitada para proteger desempenho.
- **Mapas mais limpos:** manchas de sangue, lama e musgo no chão agora têm bordas orgânicas; elementos congelados incoerentes do Snow foram removidos.
- **Animações revisadas:** jogador responde à velocidade/direção com inclinação, joelhos e aterrissagem; monstros sincronizam passada e cabeça com o movimento.
- **Áudio refeito:** mix mais forte sem clipping, ambiência/reverb por mapa, tiros em camadas por família de arma, passos por superfície, chuva, batimento em vida baixa e trilha adaptativa.
- **Objetos e cenário:** pedras deixaram de depender do fallback em cubos e agora usam boulders facetados instanciados; caixas ganharam reforços geométricos; prédios da City receberam plinto, cornijas, pilastras e faixas de fachada sem criar colisões invisíveis.
- **Performance preservada:** os novos boulders são instanciados por material/variante e os detalhes de fachada continuam em batches.
- **Regressões:** QA cobre skin, controle, poças/reflexos, geometria dos objetos, modos/Story, movimento/colisão, combate, bosses, multiplayer e segurança do Dev Mode.

### Conteúdo preservado da v49

Fluxo **Modo → Mapa → Dificuldade**, Story com 10 levels por mapa e 20 waves, 3 estrelas por level, Infinity, Contra o Tempo, dificuldades Normal/Médio/Hard/Hardcore e seus multiplicadores/regras continuam ativos.

### Versões

- Android: versionCode 50 / versionName 0.45.0.
- Windows: 0.45.0.
