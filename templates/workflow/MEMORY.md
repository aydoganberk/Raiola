# MEMORY

- Last updated: `2026-04-01`
- Status: `active_recall_plus_durable`

## Rules

- Bu dosya yalnizca kullanici explicit olarak "bunu memory'e kaydet" benzeri bir istekte bulundugunda guncellenir.
- `Active Recall Items` aktif milestone icinde gecici ama tekrar cagrilmasi gereken notlar icindir.
- `Active Recall Items` ayni milestone devam ederken yeni context window acildiginda otomatik okunur.
- `Active Recall Items` milestone complete oldugunda temizlenir ve arsiv kaydina snapshot olarak tasinir.
- `Durable Notes` milestone disi daha kalici, tekrar gerekecek ve complete sonrasinda da tutulacak bilgiler icindir.
- Kisa tutulur.
- Standart kayit icin `npm run workflow:save-memory -- --title "..." --note "..."` kullan.
- Aktif milestone varken helper varsayilan olarak `active` mode ile yazar; kalici not icin `--mode durable` kullan.

## Active Recall Items

- `Henuz aktif recall notu yok`

## Durable Notes

- `Henuz kaydedilmis durable note yok`
