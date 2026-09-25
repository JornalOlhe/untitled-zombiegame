## Dead Recoil 0.11.0 QA

- Lucky Spin ganhou uma roleta mais longa e menos previsível, com quantidade de cards, duração e ponto de parada variando a cada giro.
- O resultado real continua sendo sorteado antes da animação; o suspense visual não altera as probabilidades.
- Near-miss ocasional: o Divino pode chegar muito perto da seta, passar um pouco e voltar, ou aparecer do outro lado antes do resultado final.
- O Divino não fica mais preso sempre à esquerda do prêmio: a sequência visual é recriada e distribuída a cada giro.
- A seta pode frear perto da borda do card para criar suspense, mas os últimos instantes sempre encaixam o prêmio no centro exato.
- A faixa ganhou um buffer grande depois do prêmio para não parecer que a roleta termina logo após o resultado.
- Giros agora variam desaceleração e micro-overshoot para evitar a sensação de animação repetida.
- Resultado Divino ganhou animação própria com flash, raios, partículas, destaque do card, iluminação e áudio especial.
- O sistema da roleta continua lendo o catálogo dinamicamente, deixando o código preparado para receber novas armas e classes mais adiante.
- Android e Windows passam a reportar a versão 0.11.0.

Esta build é QA. No Windows, a v0.10.0 com o atualizador de inicialização detecta a release v11 e oferece o download de `DeadRecoil-Windows.exe`.

- Lendário, Mítico e Divino agora são recebidos sem confirmação pós-giro; qualquer resultado é aplicado diretamente.
- O aviso de proteção foi movido para antes do giro: ele aparece somente ao tentar girar novamente com um item Mítico ou Divino equipado, com a pergunta “Você deseja prosseguir?”.
