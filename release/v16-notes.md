## Dead Recoil 0.16.0 QA

Esta release troca todos os monstros por modelos voxel novos e adiciona bosses com cinemáticas, obstáculos escaláveis, medkits e física.

### Monstros novos
- Zumbi, Esqueleto, Rastejante, Ciborgue, SWAT e Construtor com skins pintadas e animações próprias: zumbis sem arma andam com os braços para frente, o Rastejante rasteja, o SWAT usa escudo e cassetete, o Construtor carrega dinamite e detonador.
- Headshot que mata arranca a cabeça do zumbi.

### Bosses
- **Demônio** a cada 20 ondas e **Yeti** a cada 10. **Quarterback** e **Mutante** se revezam como mini-bosses nas outras ondas múltiplas de 5.
- As cinemáticas de entrada (até 5 s) acontecem numa arena longe do mapa: o Demônio levanta do trono no inferno e pega o tridente; o Yeti sai da toca na nevasca e ruge. No final eles saltam e caem no meio do mapa, num círculo marcado no chão, com onda de choque.
- Habilidades: Quarterback faz "blitz" e derruba; Mutante deixa poças de gosma (10 s, dão dano); Yeti congela e deixa lento a cada 5 s; Demônio suga vida de quem está perto e arremessa o tridente com uma listra vermelha no chão avisando a trajetória.
- Sons gerados com ElevenLabs (rugido, nevasca, tridente, salto, impacto e mais).

### Mapa
- Árvores, postes, pedras, barreiras, troncos e escadas de caixas em estilo voxel.
- Obstáculos baixos agora dão para subir andando ou pulando (pedras, barreiras, capô e teto dos carros), sem paredes invisíveis.
- Barris, cones, lixeiras e caixas com física: você empurra, e explosões e bosses arremessam.
- Medkits aparecem a cada 30 s (até 3 no mapa, aparecem no minimapa) e recuperam 35% da vida.

### Versões
- Android: versionCode 16 / versionName 0.16.0.
- Windows: versão 0.16.0.

Instalações com o atualizador de inicialização (v10+) detectam a tag v16 como uma versão mais recente e oferecem o asset `DeadRecoil-Windows.exe`.
