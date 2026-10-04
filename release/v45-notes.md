# Dead Recoil 0.40.0 — v45

Hotfix de consistência da economia e feedback visual, construído sobre a v44 sem remover as correções anteriores de performance, showroom, hitboxes, barris, navegação, loadout, armas secretas e classes secretas.

- **Carteira unificada:** HUD, Perfil, Armory e Loadout passam a ler o mesmo saldo vivo da sessão. Recompensas de kills, ondas, bosses e minibosses ficam disponíveis de forma consistente no fluxo de loadout.
- **Sincronização segura:** respostas atrasadas do Supabase não podem reduzir um saldo confirmado mais novo. Recompensas ainda em voo são reaplicadas apenas na memória da sessão e não são gravadas como saldo confirmado antes da resposta autoritativa do servidor.
- **Compras e ações de conta:** spin, equip, compra de slot, cosméticos e preferências preservam recompensas pendentes em vez de fazer o saldo visual voltar temporariamente.
- **Monstros ao receber tiro:** removido o flash emissivo aplicado ao material do corpo inteiro, que fazia modelos voxel ficarem brancos ou avermelhados. O feedback de acerto continua por sangue, partículas, marcas, número de dano e hitmarker sem alterar a textura/material do monstro.
- **Regressões automatizadas:** testes exigem que HUD e Loadout compartilhem a mesma carteira viva, protegem contra rollback de snapshot e verificam que hits não trocam/tintam os materiais do corpo dos monstros.

### Versões
- Android: versionCode 45 / versionName 0.40.0.
- Windows: 0.40.0.
