## Dead Recoil 0.17.0 QA

### Pity de armas e classes
- Pity Mítico separado para armas e classes: **75 pontos**.
- Pity Divino separado para armas e classes: **150 pontos**.
- Normal Spin soma **+1** aos dois contadores da categoria girada.
- Lucky Spin soma **+2** aos dois contadores da categoria girada.
- O giro que atinge 75 já garante **Mítico ou Divino**.
- O giro que atinge 150 já garante **Divino**.
- Mítico obtido naturalmente reseta apenas o pity Mítico; o pity Divino continua.
- Divino reseta os dois pities da categoria.
- Pity de armas nunca altera pity de classes e vice-versa.
- Saves antigos com o pity legado são migrados sem apagar o progresso existente.

### Economia
- Normal Spin: **50 moedas**.
- Lucky Spin: custo base atualizado para **250 moedas**.
- A habilidade de desconto do Engineer continua aplicada sobre o custo base do Lucky Spin.
- Tickets continuam funcionando normalmente e também contam para o pity.

### Interface e QA
- Armory agora mostra barras separadas de **Mítico 0/75** e **Divino 0/150**.
- A interface informa quando o próprio giro já está garantido como Mítico+ ou Divino.
- Testes automatizados cobrem custo dos spins, incremento +1/+2, garantias 75/150, resets e independência entre classes/armas.
- Android: `versionCode 17` / `0.17.0`.
- Windows: `0.17.0`.
