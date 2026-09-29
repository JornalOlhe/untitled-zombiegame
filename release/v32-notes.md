# Dead Recoil 0.30.1

## Hotfix de combate
- **Lança-chamas e lança-gelo:** o volume de dano agora é um cone físico estreito a partir do cano, sem a antiga folga angular que virava uma hitbox enorme perto do jogador.
- **Paredes:** o primeiro obstáculo sólido encerra tanto o dano quanto o efeito visual do jato. Inimigos atrás da parede recebem **0 dano**.
- **Desempenho:** menos partículas simultâneas nos jatos e partículas são recicladas assim que colidem com cenário.
- **Balanceamento:** reduzidos os picos de DPS de Wraith M4A1, Cerberus Laser, Quantum Annihilator, Fire Incarnation, Dawn Spear, Heavenfall Bazooka, Absolute Zero, Demonic Fury e Angelic Specter, mantendo a progressão de raridade.

## Modo desenvolvedor
- **Conta totalmente isolada:** o DEV não usa mais a carteira/progresso da conta real.
- **DEAD:** ativa o sandbox e reinicia o runtime do jogo.
- **DAED:** enquanto o DEV está ativo, desativa o sandbox, reinicia e volta à conta normal.
- O sandbox inicia em **LVL 1, 0 moedas, 0 tickets**, com slots máximos e qualquer arma/classe disponível pelo Armory/console.
- Spins DEV são locais e gratuitos; chamadas que alterariam a conta real são bloqueadas.
- A partida DEV continua com munição/abilidades/granadas de teste, mas não injeta mais 999999 moedas.

## Regressões cobertas
- parede bloqueando dano para todas as armas;
- largura/alcance real dos jatos;
- carteira preservada no DEV;
- melee e terceira pessoa;
- comparação semântica do updater para evitar loop de atualização.
