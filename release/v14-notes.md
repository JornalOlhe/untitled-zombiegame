## Dead Recoil 0.14.0 QA

Esta release reverte o visual dos zumbis introduzido na v13 e refaz a mecânica dos arcos.

### Zumbis e bosses
- Voltaram ao modelo original (formas arredondadas), desfazendo o rig cúbico estilo Minecraft da v13.

### Arcos (Arco Curto, Arco Longo, Arco do Caçador Fantasma)
- Agora funcionam como um arco de verdade: segure o botão de ataque para puxar a corda e solte para atirar uma única flecha.
- Quanto mais tempo você segurar a puxada, mais forte é o tiro (dano escala entre um mínimo, num toque rápido, e um máximo, com a corda totalmente puxada).
- Munição infinita, sem recarga.
- Nova animação em primeira pessoa: a flecha encaixada na corda desliza para trás junto com a mão de apoio enquanto carrega, voltando ao lugar assim que o tiro é solto.
- Removida a antiga habilidade de "rajada automática de flechas extras", substituída pelo sistema de carga.

### Outras correções
- Corrigido o texto da Armaria que rotulava toda arma de munição infinita como "corpo a corpo"; arcos agora mostram "munição infinita" corretamente.

### Versões
- Android: versionCode 14 / versionName 0.14.0.
- Windows: versão 0.14.0.

Instalações com o atualizador de inicialização (v10+) detectam a tag v14 como uma versão mais recente e oferecem o asset `DeadRecoil-Windows.exe`.
