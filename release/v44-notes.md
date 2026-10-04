# Dead Recoil 0.39.0 — v44

Consolidação sobre a árvore mais recente da v43, preservando as correções de ondas, loadout, preferência x1.5, navegação, modal, Demonic Fury, Angelic Specter e acessórios das classes secretas.

- Showroom com catálogo de miniaturas renderizadas dos cosméticos reais, filtros, prévia antes da compra e rotação por toque, mouse ou botões. Layout ajustado para desktop e celulares; scroll suave respeita a preferência de movimento reduzido.
- Corpo articulado em blocos, cabelo preto, torso sem camiseta, calça cargo e tênis com sola clara. A textura usa regiões da referência visual fornecida; o mesmo construtor serve ao jogo, multiplayer e showroom.
- Recompensas aparecem imediatamente no HUD autenticado. A projeção visual fica separada do saldo confirmado; respostas atrasadas reconhecem somente recompensas já enviadas, preservando as recebidas durante a sincronização.
- Dano de streams, melee, Specter e projéteis usa a pose do corpo em vez de um alvo vertical fixo acima do crawler. Barris recebem também impactos da trajetória da Specter e da lança, além dos caminhos de dano já corrigidos na v43.
- Colisores complementares em peças físicas do cenário; troncos usam proxies simples para bloquear tiros sem raycasts nas folhas. Mantidas as correções recentes de piso dos props, escadas e remoção das grandes fachadas vermelhas da City.
- Geometrias agrupadas e instâncias liberadas na troca de mapas; HUD evita reconstruir conteúdo que não mudou.
- Estado resgatado e contadores de missões mais legíveis. Espaçamentos do showroom usam uma escala de pixels pares; valores de economia e contadores reais são preservados.
- Corrigida a divergência de versão que impedia o gate Android: o jogo anunciava 0.37.0 dentro do pacote 0.38.0. Novo teste exige versões iguais no jogo, Android e Windows.

A publicação depende da regressão completa, boot real do APK no emulador e instalação/execução do instalador Windows. APK com sufixo `manual` utiliza assinatura de debug quando a chave de produção não está configurada; pode não atualizar instalações assinadas com outra chave.
