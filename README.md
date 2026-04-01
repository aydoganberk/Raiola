# codex-workflow-kit

Bu repo, repo-ici workflow/milestone/handoff disiplinini baska projelere tasimak icin hazirlanmis temiz bir starter kit'tir.

Icinde uc ana parca var:

- `templates/workflow/`: hedef repoda `docs/workflow/` altina kopyalanacak starter dokuman yuzeyi
- `scripts/workflow/`: workflow helper script'leri
- `skill/`: repo-local workflow skill kaynagi

## Bu repoda ne temizlendi

- Ornek completed milestone arsivleri kaldirildi
- Template dosyalari generic idle/starter state'e cekildi
- Kokte kurulum odakli README ve `package.json` script yuzeyi eklendi

## Hedef repoya kurulum

Asagidaki akis, bu kit'i baska bir repoya tasimak icin onerilen en kisa yoldur:

1. Workflow dokumanlarini hedef repoya kopyala.
2. Helper script'leri hedef repoya kopyala.
3. Skill dosyasini repo-local skill yoluna yerlestir.
4. Bu repodaki `package.json` icindeki `scripts` kayitlarini hedef reponun mevcut `package.json` dosyasina merge et.
5. Hedef reponun `AGENTS.md` dosyasini kendi ekip kurallarina gore guncelle.
6. Ilk kurulumdan sonra `doctor` ve `health` komutlarini kos.

Ornek kopyalama:

```bash
mkdir -p /path/to/target-repo/docs
mkdir -p /path/to/target-repo/scripts
mkdir -p /path/to/target-repo/.agents/skills/codex-workflow
cp -R templates/workflow /path/to/target-repo/docs/workflow
cp -R scripts/workflow /path/to/target-repo/scripts/workflow
cp scripts/compare_golden_snapshots.ts /path/to/target-repo/scripts/compare_golden_snapshots.ts
cp skill/SKILL.md /path/to/target-repo/.agents/skills/codex-workflow/SKILL.md
```

## Ilk dogrulama

Hedef repoda su komutlarla starter yuzeyini hizlica kontrol et:

```bash
npm run workflow:doctor -- --strict
npm run workflow:health -- --strict
npm run workflow:next
```

Hedef repo `npm` yerine baska bir package manager kullaniyorsa ayni script isimlerini ona gore calistirabilir veya script'leri dogrudan `node` ile cagirabilirsin.

## Notlar

- Workflow varsayilan degildir; explicit user opt-in ile aktive edilir.
- Varsayilan calisma root'u `docs/workflow` olarak tasarlanmistir.
- `completed_milestones/` klasoru starter kit'te bilerek bos gelir.
