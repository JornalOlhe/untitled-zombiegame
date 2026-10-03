# Dead Recoil 0.36.0 — v41

Continuação da v40, com verificação completa da economia persistida, revisão visual das 23 armas e restauração dos testes obrigatórios de publicação.

- Economia conferida no Supabase `dead-recoil`: normal/rastejante 10; SWAT/Constructor/Cyborg 50; aparição de boss/miniboss 10; miniboss 500; boss 1000; onda 50.
- Teste autenticado de persistência: o cenário combinado credita 2.190 moedas, atualiza `coins_earned` uma vez e não paga novamente ao reenviar os mesmos resultados. Os dados temporários são revertidos.
- Angelic Specter: preserva as cinco lâminas e a coreografia; calcula os comprimentos da curva uma vez por ataque, reduzindo trabalho e alocações durante os golpes. Trajetórias idênticas, verificadas a 30/60/144 FPS.
- Revisão visual reproduzível das 23 armas em repouso, ataque e recarga, com os modelos e animações reais. Mantém as correções de empunhadura, foice, arcos, melees, terceira pessoa e origem dos projéteis da v40.
- A publicação depende de toda a suíte de gameplay/UI, boot real do APK em emulador, instalação e execução do Windows. Todos os assets empacotados no APK são comparados com o código da release.
- A release v41 é criada uma única vez: não substitui assets nem reposiciona tags de releases anteriores.

Quando o arquivo Android tiver o sufixo `manual`, ele é uma compilação para instalação manual, sem a chave de assinatura de produção; não é uma atualização automática compatível com APKs assinados por outra chave.
