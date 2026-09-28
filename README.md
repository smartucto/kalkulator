# kalkulator

Regresné testy produkčného modelu `kalkulator-zivnost-sro.html` spustíte cez
`node --test tests/*.test.cjs` (Node.js 22). Spúšťajú sa aj pri push a pull
requeste v GitHub Actions. Testy načítajú funkcie priamo z produkčného HTML;
nevyžadujú balíčky ani kopírovanie modelu do samostatného súboru.

Pokryté sú centové hranice sociálneho poistenia SZČO, sadzby dane FO a PO,
všetky pásma minimálnej dane PO, výnimka pri prvom priznaní a kombinácie
zdravotného poistenia, DFT a dodatočných nákladov. Ide o annualizovaný
orientačný model; limit sociálneho poistenia sa v praxi posudzuje podľa
príjmov predchádzajúceho roka a dátumu vzniku poistenia.
