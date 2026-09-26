## Dead Recoil 0.25.0

### Classes finalizadas
- O roster foi refeito com os valores definidos para Recruit, Scout, Medic, Gunslinger, Guardian, Sharpshooter, Engineer, Berserker, Phantom, Demolitionist, Vanguard, Revenant, Storm Caller, Warlord, Juggernaut, Deadeye, Archon, Void Walker, Vampire, Reaper, Serafim e Deathless.
- Habilidades ativas sem exceção própria usam 30 s de recarga. Reaper usa 15 s.
- Medic e Vampire são classes puramente passivas; Deathless usa uma única ressurreição por partida.
- Reaper gasta 5 eliminações válidas para fazer 5 zumbis aliados emergirem do chão. O pré-modelo mantém no máximo 5 aliados vivos ao mesmo tempo.
- Serafim usa carga de 50 eliminações. Archangel e Archdemon usam 100 e consomem a carga ao ativar.

### Raridade Secreta
- **Archangel:** auréola sempre acima da cabeça, asas procedurais que batem durante o voo e 30 s de voo quando a carga é liberada.
- **Archdemon:** chifres, cauda segmentada e ponta em rotor; durante o voo a cauda sobe e gira como uma hélice, com pose corporal mais solta.
- O voo permite subir/descer no protótipo e termina com descida mais lenta.
- A chance Secreta usa o mesmo tier para classes e armas. Na v25 os valores protótipo são 0,01% no Normal Spin e 0,10% no Lucky Spin.

### Armas Secretas
- **Demonic Fury:** tridente de duas mãos com pose de lança, estocada e arremesso com trajetória visual de ida e volta. O arremesso normal pode registrar headshot.
- Com Archdemon em voo, acerto direto do tridente elimina o alvo; impacto no chão causa dano em área e deixa uma zona protótipo de chamas infernais.
- **Angelic Specter:** não fica presa à mão. O pré-modelo flutua, acompanha o braço direito e faz cortes capazes de atingir múltiplos inimigos.
- A habilidade própria faz o Specter rodopiar por 5 s, com 30 s de recarga. Durante o voo do Archangel, pode ser arremessado girando e voltar girando sem cooldown enquanto o voo estiver ativo.
- No teclado, a habilidade própria da arma usa **F** por padrão e pode ser remapeada. No mobile existe o botão **ARMA**.

### Modelos desta release
- Os acessórios Secretos e as duas armas já têm **pré-modelos 3D procedurais jogáveis** para validar tamanho, posição, animações e mecânica dentro do jogo.
- Eles ainda não substituem os futuros GLBs finais feitos no Blender a partir dos UVs detalhados; a arquitetura foi deixada pronta para essa troca.
- A duração da zona de chamas da Demonic Fury está em 5 s como valor protótipo até o balanceamento final.

### Atualização e instalação
- Windows continua usando `DeadRecoil-Setup-0.25.0.exe`. Uma instalação feita pelo setup detecta releases posteriores, baixa o próximo setup, verifica SHA-256, instala silenciosamente e reabre o jogo.
- O fluxo antigo de executável portátil não é necessário para atualizar versões instaladas pelo setup.
- Android usa `versionCode 25` / `versionName 0.25.0`.

### Artefatos
- Windows: `DeadRecoil-Setup-0.25.0.exe`
- Android: `DeadRecoil-v25.apk`
