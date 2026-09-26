# Backend online do Dead Recoil (Supabase)

Projeto: `dead-recoil` (`bfrewibnwclziuugypck`, região São Paulo), org SinalZero, plano gratuito.

O jogo só contém a URL do projeto e a chave **publishable** (`android/app/src/main/assets/js/config.js`).
Nenhum segredo (service_role, client secret do Google) fica no cliente.

## O que já está pronto

- `migrations/` guarda tabelas, índices, constraints, RLS, funções e triggers. Já estão aplicadas no projeto.
  - **Contas:** `profiles`, `player_stats`, `player_inventory`, `player_classes`. O trigger `on_auth_user_created` cria o perfil com o loadout inicial.
  - **Economia autoritativa:** spins (com o pity 75/150 da v17), loadout, slots e cosméticos passam por funções `SECURITY DEFINER`. O cliente não tem permissão de `INSERT/UPDATE/DELETE` em nenhuma tabela.
  - **Recompensas:** `run_start` / `run_report` calculam moedas e XP no servidor. Kills, ondas e chefes são limitados pelo tempo real da partida medido no servidor. No multiplayer, cada jogador também fica limitado ao placar que o host enviou. Pedidos repetidos (`request_id`) nunca pagam duas vezes.
  - **Missões infinitas:** 3 ativas, com 14 tipos e 7 raridades. O gerador é ponderado, respeita armas e classes desbloqueadas e evita as últimas 8 missões. `mission_claim` é atômico, então não existe claim duplo.
  - **Lobbies:** código curto, quick play, ready, start só pelo host, kick/ban, heartbeat e migração de host.
  - **Realtime:** o canal privado `lobby:<id>` só aceita membros do lobby (RLS em `realtime.messages`).
- `tests/backend_smoke.sql` é o teste de ponta a ponta do backend. Roda como usuários reais (role `authenticated`) e cobre RLS, spins, runs, missões e lobbies.

## Configuração que precisa ser feita no painel (uma vez)

Estas opções ficam na configuração do Auth e não podem ser alteradas por SQL.
Abra https://supabase.com/dashboard/project/bfrewibnwclziuugypck.

### 1. URLs de retorno (obrigatório para Google, confirmação de e-mail e recuperação de senha)

**Authentication → URL Configuration**

- **Site URL:** `untitledzombie://auth/callback`
- **Redirect URLs:** adicione
  - `untitledzombie://auth/callback**`
  - `http://127.0.0.1:*/auth/callback**` (login Google no Windows: o jogo abre um servidor local de uso único)
  - (opcional, versão web) a URL onde o jogo for hospedado

Sem isso, os links dos e-mails voltam para `http://localhost:3000`, que é o padrão do Supabase.

### 2. Login com Google

1. No Google Cloud Console, vá em **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Tipo: **Web application**.
   - Authorized redirect URI: `https://bfrewibnwclziuugypck.supabase.co/auth/v1/callback`
2. No Supabase, vá em **Authentication → Providers → Google**. Ative e cole o **Client ID** e o **Client Secret**.
   O segredo fica só no Supabase, nunca no jogo.

Fluxo no jogo:
- O botão abre a página oficial do Google: no Android numa Chrome Custom Tab, no Windows no navegador padrão.
- Depois do login, o Google redireciona para `untitledzombie://auth/callback?code=…`.
- O sistema reabre o jogo, que troca o código (PKCE) por uma sessão.

### 3. E-mails (feito: SMTP do Brevo, 100 e-mails/hora, remetente "Dead Recoil")

O remetente padrão do Supabase aceita só **cerca de 2 e-mails por hora** (confirmação e recuperação de senha somados).
Para jogadores reais:

- Configure um SMTP em **Authentication → Emails → SMTP Settings** (por exemplo Resend ou Brevo, ambos com plano grátis).
- Ou, só para testes, desative **Confirm email** em **Authentication → Providers → Email**.

## Limites do plano gratuito (Realtime)

O multiplayer envia estados de 7 a 10 vezes por segundo, e o host envia snapshots de 6 a 8 vezes por segundo, tudo empacotado.
Uma partida de 4 jogadores gasta cerca de 250 mil mensagens por hora.
O plano grátis inclui 2 milhões de mensagens por mês.
As taxas podem ser ajustadas em `js/config.js` (`net`).
