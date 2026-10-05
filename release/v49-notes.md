# Dead Recoil 0.44.0 — v49

Hotfix de saldo e consolidação da atualização de modos/Story.

- **Saldo corrigido:** ao encerrar uma partida, o resultado final do servidor passa a ser a fonte autoritativa do saldo. Moedas otimistas do HUD não ficam mais presas no menu quando há diferença de arredondamento ou confirmação.
- **HUD imediato preservado:** durante a partida as moedas continuam subindo na hora; checkpoints parciais continuam protegidos contra respostas antigas.
- **Regressão nova:** simula 4.000 confirmadas + 2.000 exibidas pelo HUD, com servidor fechando em 5.900; após o fim da partida, menu/loadout ficam exatamente em 5.900 e o pendente zera.
- **Inclui tudo da v48:** fluxo Modo → Mapa → Dificuldade, Story com 10 levels por mapa/20 waves/3 estrelas, Infinity, Contra o Tempo, dificuldades Normal/Médio/Hard/Hardcore, multiplicadores e o personagem base remodelado conforme a referência enviada.

### Versões
- Android: versionCode 49 / versionName 0.44.0.
- Windows: 0.44.0.
