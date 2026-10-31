-- IA-TB Fundamental Engine V3
-- Le registre contient les sources. Les rubriques/flux sont des FEEDS afin d'eviter les faux doublons.

INSERT OR IGNORE INTO sources(code,name,source_type,country,priority,grade,reliability_base,speed_base,independence_group,homepage_url,enabled,notes,created_at,updated_at) VALUES
('FED','Federal Reserve Board','OFFICIAL','US','P1','A+',100,78,'US_FEDERAL_RESERVE_SYSTEM','https://www.federalreserve.gov/',1,'Source primaire politique monetaire US.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('ECB','European Central Bank','OFFICIAL','EU','P1','A+',100,78,'ECB','https://www.ecb.europa.eu/',1,'Source primaire politique monetaire zone euro.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('BLS','U.S. Bureau of Labor Statistics','OFFICIAL','US','P1','A+',100,72,'US_BLS','https://www.bls.gov/',1,'Inflation, emploi et prix US.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('BEA','U.S. Bureau of Economic Analysis','OFFICIAL','US','P1','A+',100,65,'US_BEA','https://www.bea.gov/',1,'PIB, consommation et activite economique US.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('UST','U.S. Department of the Treasury','OFFICIAL','US','P1','A+',100,75,'US_TREASURY','https://home.treasury.gov/',1,'Dette, financement et politique du Treasury.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('EUROSTAT','Eurostat','OFFICIAL','EU','P1','A+',100,65,'EUROSTAT','https://ec.europa.eu/eurostat/',1,'Statistiques macro officielles de l Union europeenne.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('INSEE','INSEE','OFFICIAL','FR','P2','A+',100,60,'INSEE','https://www.insee.fr/',1,'Complement macro France.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('BOE','Bank of England','OFFICIAL','GB','P1','A+',100,72,'BOE','https://www.bankofengland.co.uk/',1,'Politique monetaire britannique.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('BOJ','Bank of Japan','OFFICIAL','JP','P1','A+',100,68,'BOJ','https://www.boj.or.jp/en/',1,'Politique monetaire japonaise et liquidite mondiale.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('PBOC','People''s Bank of China','OFFICIAL','CN','P1','A+',98,55,'PBOC','http://www.pbc.gov.cn/en/3688006/index.html',1,'Politique monetaire chinoise.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('IMF','International Monetary Fund','OFFICIAL','INT','P2','A+',98,45,'IMF','https://www.imf.org/',1,'Risques macro et perspectives mondiales.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('BIS','Bank for International Settlements','OFFICIAL','INT','P2','A+',98,45,'BIS','https://www.bis.org/',1,'Credit, banques, liquidite et structure financiere mondiale.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('OECD','OECD','OFFICIAL','INT','P2','A+',98,45,'OECD','https://www.oecd.org/',1,'Tendances economiques structurelles.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('SEC','U.S. Securities and Exchange Commission','OFFICIAL','US','P1','A+',100,88,'US_SEC','https://www.sec.gov/',1,'Regulation et enforcement des marches US, y compris crypto.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('CFTC','Commodity Futures Trading Commission','OFFICIAL','US','P1','A+',100,88,'US_CFTC','https://www.cftc.gov/',1,'Derives, futures et regulation crypto US.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('ESMA','European Securities and Markets Authority','OFFICIAL','EU','P1','A+',100,72,'ESMA','https://www.esma.europa.eu/',1,'Supervision et regulation des marches europeens.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('AMF','Autorite des marches financiers','OFFICIAL','FR','P1','A+',100,82,'AMF_FR','https://www.amf-france.org/',1,'Regulation et alertes France.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('EBA','European Banking Authority','OFFICIAL','EU','P1','A+',100,65,'EBA','https://www.eba.europa.eu/',1,'MiCA, stablecoins et cadre bancaire europeen.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('FCA','Financial Conduct Authority','OFFICIAL','GB','P2','A+',100,75,'FCA','https://www.fca.org.uk/',1,'Regulation des marches et crypto au Royaume-Uni.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('FATF','Financial Action Task Force / GAFI','OFFICIAL','INT','P2','A+',98,45,'FATF','https://www.fatf-gafi.org/',1,'Standards internationaux AML et actifs virtuels.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('WHITE_HOUSE','The White House','OFFICIAL','US','P1','A+',100,92,'US_EXECUTIVE','https://www.whitehouse.gov/',1,'Confirmation officielle des annonces de l executif americain.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('FEDERAL_REGISTER','Federal Register','OFFICIAL','US','P1','A+',100,65,'US_FEDERAL_REGISTER','https://www.federalregister.gov/',1,'Texte officiel pour distinguer annonce et entree en vigueur.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('CME','CME Group','DATA_PROVIDER','US','P1','A',94,92,'CME_GROUP','https://www.cmegroup.com/',1,'Futures, taux et FedWatch. FedWatch est un feed PREVISION, pas un fait.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('CBOE','Cboe Global Markets','DATA_PROVIDER','US','P1','A',94,90,'CBOE','https://www.cboe.com/',1,'Volatilite et regime risk-on/risk-off.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('ICE','Intercontinental Exchange','DATA_PROVIDER','US','P1','A',94,88,'ICE','https://www.ice.com/',1,'Dollar et infrastructure de marche.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('FRED','FRED - Federal Reserve Bank of St. Louis','DATA_PROVIDER','US','P1','A',98,70,'US_FEDERAL_RESERVE_SYSTEM','https://fred.stlouisfed.org/',1,'Agregation macro de reference; ne compte pas comme confirmation independante de la FED.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('COINMETRICS','Coin Metrics','DATA_PROVIDER','INT','P1','A',92,82,'COINMETRICS','https://coinmetrics.io/',1,'Metriques reseau et marche crypto structurees.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('DEFILLAMA','DefiLlama','DATA_PROVIDER','INT','P1','A',90,92,'DEFILLAMA','https://defillama.com/',1,'TVL, stablecoins et flux DeFi.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('GLASSNODE','Glassnode','ANALYTICS','INT','P2','B',86,84,'GLASSNODE','https://glassnode.com/',1,'Analyse on-chain.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('CRYPTOQUANT','CryptoQuant','ANALYTICS','INT','P2','B',84,90,'CRYPTOQUANT','https://cryptoquant.com/',1,'Flux exchanges et metriques on-chain.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('GOOGLE_TRENDS','Google Trends','DATA_PROVIDER','INT','P1','A',92,70,'GOOGLE_TRENDS','https://trends.google.com/',1,'Mesure de l interet public, pas de la veracite d une information.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('GITHUB','GitHub','DATA_PROVIDER','INT','P2','A',94,88,'GITHUB','https://github.com/',1,'Activite de developpement des projets suivis.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('REUTERS','Reuters','MEDIA','INT','P1','A',95,96,'REUTERS','https://www.reuters.com/',1,'Agence generaliste rapide; utile pour confirmation independante.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('BLOOMBERG','Bloomberg','MEDIA','INT','P1','A',94,95,'BLOOMBERG','https://www.bloomberg.com/',1,'Finance mondiale et contexte marche.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('FT','Financial Times','MEDIA','INT','P2','A',92,72,'FINANCIAL_TIMES','https://www.ft.com/',1,'Macro, finance et contexte.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('COINDESK','CoinDesk','MEDIA','INT','P1','B',84,94,'COINDESK','https://www.coindesk.com/',1,'Media crypto generaliste; doit etre recoupe pour les faits sensibles.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('THEBLOCK','The Block','MEDIA','INT','P1','B',86,92,'THE_BLOCK','https://www.theblock.co/',1,'Media crypto specialise.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('CHAINALYSIS','Chainalysis','ANALYTICS','INT','P2','B',88,72,'CHAINALYSIS','https://www.chainalysis.com/',1,'Adoption, securite et activite blockchain.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('TRM','TRM Labs','SECURITY','INT','P2','B',86,82,'TRM_LABS','https://www.trmlabs.com/',1,'Securite, conformite et incidents.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('IMMUNEFI','Immunefi','SECURITY','INT','P2','B',86,90,'IMMUNEFI','https://immunefi.com/',1,'Hacks et exploits DeFi.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('SLOWMIST','SlowMist','SECURITY','INT','P2','B',82,96,'SLOWMIST','https://www.slowmist.com/',1,'Alertes securite crypto rapides.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('PECKSHIELD','PeckShield','SECURITY','INT','P2','B',82,96,'PECKSHIELD','https://peckshield.com/',1,'Alertes techniques et incidents on-chain.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z'),
('TRUMP','Donald J. Trump','PUBLIC_FIGURE','US','P1','B',72,100,'DONALD_TRUMP','https://www.whitehouse.gov/administration/donald-j-trump/',1,'Une publication officielle prouve la declaration, pas automatiquement l entree en vigueur de la mesure.','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z');


-- v1.6.8 : medias crypto supplementaires. Ils restent secondaires face aux sources officielles.
INSERT OR IGNORE INTO sources(code,name,source_type,country,priority,grade,reliability_base,speed_base,independence_group,homepage_url,enabled,notes,created_at,updated_at) VALUES
('COINTELEGRAPH','Cointelegraph','MEDIA','INT','P2','B',80,94,'COINTELEGRAPH','https://cointelegraph.com/',1,'Media crypto specialise; recouper les informations sensibles avec une source primaire.','2026-08-28T08:00:00Z','2026-08-28T08:00:00Z'),
('NEWSBTC','NewsBTC','MEDIA','INT','P3','C',70,90,'NEWSBTC','https://www.newsbtc.com/',1,'Media crypto secondaire, utile pour couverture rapide; recoupement recommande.','2026-08-28T08:00:00Z','2026-08-28T08:00:00Z'),
('DECRYPT','Decrypt','MEDIA','INT','P2','B',80,91,'DECRYPT','https://decrypt.co/',1,'Media crypto/Web3 secondaire, utilise via WEB lorsque necessaire.','2026-08-28T08:00:00Z','2026-08-28T08:00:00Z'),
('BEINCRYPTO','BeInCrypto','MEDIA','INT','P3','C',72,88,'BEINCRYPTO','https://fr.beincrypto.com/',1,'Media crypto secondaire; inclut analyses/opinions et doit etre recoupe.','2026-08-28T08:00:00Z','2026-08-28T08:00:00Z'),
('NYFED','Federal Reserve Bank of New York','OFFICIAL','US','P1','A+',99,92,'NYFED','https://www.newyorkfed.org/markets/reference-rates',1,'Source officielle EFFR utilisee par le calculateur FedWatch IA-TB.','2026-09-29T00:00:00Z','2026-09-29T00:00:00Z'),
('INVESTING_FED','Investing.com · Fed Rate Monitor','DATA_PROVIDER','INT','P2','B',82,94,'INVESTING_FED','https://www.investing.com/central-banks/fed-rate-monitor',1,'Validation tierce gratuite des probabilites de taux; ne remplace pas une source officielle CME.','2026-09-29T00:00:00Z','2026-09-29T00:00:00Z'),
('MACROMICRO_FED','MacroMicro · FedWatch','DATA_PROVIDER','INT','P2','B',82,78,'MACROMICRO_FED','https://en.macromicro.me/series/484/probability-fed-rate',1,'Source tierce de validation secondaire des attentes de taux.','2026-09-29T00:00:00Z','2026-09-29T00:00:00Z'),
('YAHOO_FEDFUNDS','Yahoo Finance · 30-Day Fed Funds Futures','DATA_PROVIDER','INT','P3','C',70,90,'YAHOO_FEDFUNDS','https://finance.yahoo.com/quote/ZQ=F/',1,'Reference retardee ZQ=F via endpoint public non officiel; utiliser uniquement en validation.','2026-09-29T00:00:00Z','2026-09-29T00:00:00Z');

-- Competences. Un score de domaine n'est pas un score d'impact marche.
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MONETARY',100 FROM sources WHERE code='FED';
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MACRO',95 FROM sources WHERE code='FED';
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MARKET_RISK',85 FROM sources WHERE code='FED';
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MONETARY',100 FROM sources WHERE code='ECB';
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MACRO',95 FROM sources WHERE code='ECB';
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MARKET_RISK',80 FROM sources WHERE code='ECB';
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MACRO',100 FROM sources WHERE code IN ('BLS','BEA','EUROSTAT','INSEE','IMF','OECD');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MONETARY',100 FROM sources WHERE code IN ('BOE','BOJ','PBOC');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MACRO',85 FROM sources WHERE code IN ('BOE','BOJ','PBOC','UST','BIS');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MARKET_RISK',90 FROM sources WHERE code IN ('UST','BIS','CME','CBOE','ICE','FRED');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MACRO',90 FROM sources WHERE code='FRED';
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'REGULATION',100 FROM sources WHERE code IN ('SEC','CFTC','ESMA','AMF','EBA','FCA','FATF','WHITE_HOUSE','FEDERAL_REGISTER');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'CRYPTO_NETWORK',75 FROM sources WHERE code IN ('SEC','CFTC','EBA','FCA');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'CRYPTO_NETWORK',100 FROM sources WHERE code IN ('COINMETRICS','DEFILLAMA','GLASSNODE','CRYPTOQUANT');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'ADOPTION',80 FROM sources WHERE code IN ('COINMETRICS','DEFILLAMA','GLASSNODE','CRYPTOQUANT','GOOGLE_TRENDS','GITHUB','CHAINALYSIS');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'SECURITY',100 FROM sources WHERE code IN ('TRM','IMMUNEFI','SLOWMIST','PECKSHIELD');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'SECURITY',90 FROM sources WHERE code='CHAINALYSIS';
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MACRO',85 FROM sources WHERE code IN ('REUTERS','BLOOMBERG','FT');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MARKET_RISK',90 FROM sources WHERE code IN ('REUTERS','BLOOMBERG','FT');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'REGULATION',80 FROM sources WHERE code IN ('REUTERS','BLOOMBERG','FT','COINDESK','THEBLOCK');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'CRYPTO_NETWORK',90 FROM sources WHERE code IN ('COINDESK','THEBLOCK');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'ADOPTION',75 FROM sources WHERE code IN ('COINDESK','THEBLOCK');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MACRO',80 FROM sources WHERE code='TRUMP';
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MARKET_RISK',85 FROM sources WHERE code='TRUMP';
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'REGULATION',70 FROM sources WHERE code='TRUMP';


-- v1.6.8 : couverture indicative des medias crypto ajoutes.
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'CRYPTO_NETWORK',85 FROM sources WHERE code IN ('COINTELEGRAPH','NEWSBTC','DECRYPT','BEINCRYPTO');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'ADOPTION',75 FROM sources WHERE code IN ('COINTELEGRAPH','NEWSBTC','DECRYPT','BEINCRYPTO');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'REGULATION',70 FROM sources WHERE code IN ('COINTELEGRAPH','DECRYPT','BEINCRYPTO');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MONETARY',100 FROM sources WHERE code='NYFED';
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MACRO',95 FROM sources WHERE code='NYFED';
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MONETARY',85 FROM sources WHERE code IN ('INVESTING_FED','MACROMICRO_FED','YAHOO_FEDFUNDS');
INSERT OR IGNORE INTO source_domains(source_id,domain,competence) SELECT id,'MARKET_RISK',80 FROM sources WHERE code IN ('INVESTING_FED','MACROMICRO_FED','YAHOO_FEDFUNDS');

-- Feeds RSS officiels verifies pour la fondation v1.6.0.
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'FED_PRESS_ALL','FED · All Press Releases','RSS','https://www.federalreserve.gov/feeds/press_all.xml',NULL,NULL,1,300,80,'ORIGINAL','INFORMATION','IDLE','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='FED';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'FED_MONETARY','FED · Monetary Policy','RSS','https://www.federalreserve.gov/feeds/press_monetary.xml',NULL,NULL,1,180,100,'ORIGINAL','INFORMATION','IDLE','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='FED';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'ECB_PRESS','ECB · Press / Speeches / Interviews','RSS','https://www.ecb.europa.eu/rss/press.html',NULL,NULL,1,300,90,'ORIGINAL','INFORMATION','IDLE','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='ECB';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'SEC_PRESS','SEC · Press Releases','RSS','https://www.sec.gov/news/pressreleases.rss',NULL,NULL,1,300,90,'ORIGINAL','INFORMATION','IDLE','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='SEC';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'CFTC_PRESS','CFTC · General Press Releases','RSS','https://www.cftc.gov/RSS/RSSGP/rssgp.xml',NULL,NULL,1,300,85,'ORIGINAL','INFORMATION','IDLE','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='CFTC';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'CFTC_ENFORCEMENT','CFTC · Enforcement','RSS','https://www.cftc.gov/RSS/RSSENF/rssenf.xml',NULL,NULL,1,300,90,'ORIGINAL','INFORMATION','IDLE','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='CFTC';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'AMF_ALL','AMF · Actualites et publications','RSS','https://www.amf-france.org/fr/flux-rss/display/21',NULL,NULL,1,600,75,'ORIGINAL','INFORMATION','IDLE','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='AMF';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'AMF_PRESS','AMF · Communiques de presse','RSS','https://www.amf-france.org/fr/flux-rss/display/23',NULL,NULL,1,600,85,'ORIGINAL','INFORMATION','IDLE','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='AMF';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'AMF_REGULATION','AMF · Regulation','RSS','https://www.amf-france.org/fr/flux-rss/display/31',NULL,NULL,1,600,90,'ORIGINAL','INFORMATION','IDLE','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='AMF';

-- Reseaux sociaux : comptes en liste blanche, volontairement desactives tant que le provider SOCIAL n'est pas valide.
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'FED_X','Federal Reserve · X','SOCIAL','https://x.com/federalreserve','X','@federalreserve',0,180,65,'ORIGINAL','INFORMATION','PROVIDER_PENDING','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='FED';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'SEC_X','SEC · X','SOCIAL','https://x.com/SECGov','X','@SECGov',0,180,65,'ORIGINAL','INFORMATION','PROVIDER_PENDING','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='SEC';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'TRUMP_X','Donald Trump · X','SOCIAL','https://x.com/realDonaldTrump','X','@realDonaldTrump',0,120,75,'ORIGINAL','INFORMATION','PROVIDER_PENDING','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='TRUMP';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'TRUMP_TRUTH','Donald Trump · Truth Social','SOCIAL','https://truthsocial.com/@realDonaldTrump','TRUTH_SOCIAL','@realDonaldTrump',0,120,80,'ORIGINAL','INFORMATION','PROVIDER_PENDING','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='TRUMP';

-- Une prevision reste une PREVISION meme si la source est reconnue.
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'CME_FEDWATCH','CME · FedWatch','WEB','https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html',NULL,NULL,1,900,75,'ORIGINAL','PREDICTION','IDLE','2026-08-28T00:00:00Z','2026-08-28T00:00:00Z' FROM sources WHERE code='CME';

-- v1.6.2 WEB Provider : deux pages officielles statiques utiles au contexte macro/reglementaire.
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'UST_PRESS_WEB','U.S. Treasury · Press Releases','WEB','https://home.treasury.gov/news/press-releases',NULL,NULL,1,600,82,'ORIGINAL','INFORMATION','IDLE','2026-08-28T02:30:00Z','2026-08-28T02:30:00Z' FROM sources WHERE code='UST';
INSERT OR IGNORE INTO provider_configs(feed_id,config_json,updated_at)
SELECT id,'{"mode":"LINK_LIST","include_regex":"^https://home\\.treasury\\.gov/news/press-releases/[^?#]+$","exclude_regex":"/news/press-releases/?$","max_items":45,"min_title_chars":16,"language":"en"}','2026-08-28T02:30:00Z' FROM feeds WHERE code='UST_PRESS_WEB';

INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'WHITE_HOUSE_ACTIONS_WEB','White House · Presidential Actions','WEB','https://www.whitehouse.gov/presidential-actions/',NULL,NULL,1,600,88,'ORIGINAL','INFORMATION','IDLE','2026-08-28T02:30:00Z','2026-08-28T02:30:00Z' FROM sources WHERE code='WHITE_HOUSE';
INSERT OR IGNORE INTO provider_configs(feed_id,config_json,updated_at)
SELECT id,'{"mode":"LINK_LIST","include_regex":"^https://www\\.whitehouse\\.gov/presidential-actions/(?:20[0-9]{2}/)?[^?#]+$","exclude_regex":"/presidential-actions/?$|/page/","max_items":45,"min_title_chars":16,"language":"en"}','2026-08-28T02:30:00Z' FROM feeds WHERE code='WHITE_HOUSE_ACTIONS_WEB';

-- CME FedWatch reste volontairement PROVIDER_PENDING : la page publique charge les probabilites via un composant/API dedie.
INSERT OR IGNORE INTO provider_configs(feed_id,config_json,updated_at)
SELECT id,'{"mode":"PAGE_SNAPSHOT","language":"en","label":"CME FedWatch","detail_fetch_count":1}','2026-08-28T02:30:00Z' FROM feeds WHERE code='CME_FEDWATCH';


-- v1.6.8 : nouvelles sources media. Les grades B/C rappellent qu'elles doivent etre recoupees.
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'COINDESK_RSS','CoinDesk · RSS','RSS','https://www.coindesk.com/arc/outboundfeeds/rss/',NULL,NULL,1,300,70,'ORIGINAL','INFORMATION','IDLE','2026-08-28T08:00:00Z','2026-08-28T08:00:00Z' FROM sources WHERE code='COINDESK';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'COINTELEGRAPH_RSS','Cointelegraph · RSS','RSS','https://cointelegraph.com/?format=rss',NULL,NULL,1,300,65,'ORIGINAL','INFORMATION','IDLE','2026-08-28T08:00:00Z','2026-08-28T08:00:00Z' FROM sources WHERE code='COINTELEGRAPH';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'NEWSBTC_RSS','NewsBTC · RSS','RSS','https://www.newsbtc.com/feed/',NULL,NULL,1,420,55,'ORIGINAL','INFORMATION','IDLE','2026-08-28T08:00:00Z','2026-08-28T08:00:00Z' FROM sources WHERE code='NEWSBTC';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'DECRYPT_WEB','Decrypt · Latest','WEB','https://decrypt.co/',NULL,NULL,1,420,62,'ORIGINAL','INFORMATION','IDLE','2026-08-28T08:00:00Z','2026-08-28T08:00:00Z' FROM sources WHERE code='DECRYPT';
INSERT OR IGNORE INTO provider_configs(feed_id,config_json,updated_at)
SELECT id,'{"mode":"LINK_LIST","include_regex":"^https://decrypt\.co/[0-9]+/[^?#]+$","exclude_regex":"/videos/|/press-releases/","max_items":35,"min_title_chars":16,"language":"en","detail_fetch_count":8}','2026-08-28T08:00:00Z' FROM feeds WHERE code='DECRYPT_WEB';
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,'BEINCRYPTO_WEB','BeInCrypto France · Nouvelles','WEB','https://fr.beincrypto.com/type/nouvelles/',NULL,NULL,1,480,52,'ORIGINAL','INFORMATION','IDLE','2026-08-28T08:00:00Z','2026-08-28T08:00:00Z' FROM sources WHERE code='BEINCRYPTO';
INSERT OR IGNORE INTO provider_configs(feed_id,config_json,updated_at)
SELECT id,'{"mode":"LINK_LIST","include_regex":"^https://fr\.beincrypto\.com/[^?#]+/?$","exclude_regex":"/(archive|tag|category|type|a-propos|author|press|learn|jobs|contact|privacy|terms)/","max_items":35,"min_title_chars":16,"language":"fr","detail_fetch_count":8}','2026-08-28T08:00:00Z' FROM feeds WHERE code='BEINCRYPTO_WEB';

-- v1.6.8 Social Provider X. Le Bearer Token n'est jamais stocke ici : il reste dans le coffre Core chiffre.
INSERT OR IGNORE INTO provider_configs(feed_id,config_json,updated_at)
SELECT id,'{"mode":"RECENT_SEARCH","query":"from:federalreserve -is:retweet","max_results":10,"language":"en"}','2026-08-28T08:00:00Z' FROM feeds WHERE code='FED_X';
INSERT OR IGNORE INTO provider_configs(feed_id,config_json,updated_at)
SELECT id,'{"mode":"RECENT_SEARCH","query":"from:SECGov -is:retweet","max_results":10,"language":"en"}','2026-08-28T08:00:00Z' FROM feeds WHERE code='SEC_X';
INSERT OR IGNORE INTO provider_configs(feed_id,config_json,updated_at)
SELECT id,'{"mode":"RECENT_SEARCH","query":"from:realDonaldTrump -is:retweet","max_results":10,"language":"en"}','2026-08-28T08:00:00Z' FROM feeds WHERE code='TRUMP_X';


-- v2.0 DEBUG: every registered source gets at least one collectable public feed.
-- Generic WEB feeds are conservative PAGE_SNAPSHOT monitors; specialized adapters can replace them later.
INSERT OR IGNORE INTO feeds(source_id,code,label,provider_type,endpoint,platform,account_identifier,enabled,poll_interval_sec,base_importance,content_role,content_class,status,created_at,updated_at)
SELECT id,code||'_PUBLIC_WEB',name||' · Public Web','WEB',homepage_url,NULL,NULL,1,900,55,'ORIGINAL','INFORMATION','IDLE','2026-09-30T00:00:00Z','2026-09-30T00:00:00Z'
FROM sources s WHERE s.enabled=1 AND COALESCE(s.homepage_url,'')<>'' AND NOT EXISTS(SELECT 1 FROM feeds f WHERE f.source_id=s.id);
INSERT OR IGNORE INTO provider_configs(feed_id,config_json,updated_at)
SELECT f.id,'{"mode":"PAGE_SNAPSHOT","language":"en","detail_fetch_count":1,"max_items":8}','2026-09-30T00:00:00Z'
FROM feeds f WHERE f.code LIKE '%_PUBLIC_WEB' AND NOT EXISTS(SELECT 1 FROM provider_configs pc WHERE pc.feed_id=f.id);
