# -*- coding: utf-8 -*-
"""Batch 1: 2022-2023 Mireslab / MUST surface petrography sets."""
import json, os

OUT = os.path.dirname(os.path.abspath(__file__))

def R(**kw):
    rec = {
        "source_file": None, "source_fileId": None, "sample_id": None,
        "drillhole_id": None, "depth": None, "sample_type": None,
        "rock_name": None, "rock_name_original": None, "texture": None,
        "minerals": [], "alteration": None, "opaque_minerals": None,
        "description_summary": None, "analyst_or_lab": None, "report_date": None,
    }
    rec.update(kw)
    return rec

recs = []

# ---------------------------------------------------------------- 1
SF = "Petrographic descriptions 06.23.pdf"
FID = "16r0N4TEldedRvrGcPM_hEvIeCsZfMA7v"
LAB = "Mireslab Mongol LLC (reported by Undarmaa Batsaikhan); Report #004 / Order No 004; contact Batkhurel (Innova Mineral)"
DT = "2022-06-23"
recs.append(R(source_file=SF, source_fileId=FID, sample_id="OV202202",
    sample_type="thin section (section no. 3011); sawn rock slice hand specimen",
    rock_name="Altered andesite (field name given as 'Gabbro basalt' - rejected by analyst)",
    rock_name_original=None,
    texture="Porphyritic: medium- to fine-grained relict phenocrysts (10-20%, 0.5-2 mm) set in a fine-grained altered groundmass; no deformation",
    minerals=[{"mineral":"Plagioclase","pct":"60-65"},{"mineral":"K-feldspar","pct":"10-15"},
              {"mineral":"Altered amphibole","pct":"10-20"},{"mineral":"Quartz","pct":"~5"},
              {"mineral":"Clay minerals (secondary)","pct":None},{"mineral":"Chlorite (secondary)","pct":None},
              {"mineral":"Epidote (secondary)","pct":None},{"mineral":"Carbonate (secondary)","pct":None},
              {"mineral":"Apatite (accessory)","pct":None}],
    alteration="Strong alteration, no deformation. Amphibole completely altered to chlorite + epidote + magnetite (pseudomorphs). Plagioclase cores completely replaced by clay minerals (illite, smectite). K-feldspar strongly altered to clay. Chlorite abundant as pale-green pleochroic flakes; sparse microcrystalline carbonate disseminated.",
    opaque_minerals="Opaque minerals (magnetite) after amphibole",
    description_summary="Porphyritic intermediate volcanic rock, dark grey, with 10-20% phenocrysts 0.5-2 mm. Relict plagioclase and amphibole phenocrysts sit in a fine-grained altered groundmass; amphibole is entirely pseudomorphed by chlorite-epidote-magnetite and plagioclase cores are replaced by illite/smectite. Minor quartz occurs as intergranular anhedral grains and as rare granophyric intergrowths with altered plagioclase. Analyst renames the rock altered andesite and notes the field name 'gabbro basalt' is not a valid rock name.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="OV202203",
    sample_type="thin section (section no. 3011); sawn rock slice hand specimen",
    rock_name="Mudstone (?) - oxidised, weathered",
    rock_name_original=None,
    texture="Weakly oriented matrix; dark oval clay-mineral aggregates 1-2 mm in a fine matrix",
    minerals=[{"mineral":"Clay minerals","pct":"80-90"},{"mineral":"Quartz","pct":"10-20"},
              {"mineral":"Opaque (pyrite?)","pct":None}],
    alteration="Strongly altered to clay minerals throughout; oxidised and weathered dark brown",
    opaque_minerals="Opaque minerals, possibly pyrite",
    description_summary="Oxidised, weathered dark brown mudstone identified mainly by texture and mineral assemblage because it is too strongly clay-altered to resolve optically. Dark oval bodies visible in hand specimen are colourless, low-relief clay aggregates 1-2 mm across under PPL. The matrix is clay-rich with subordinate fine quartz and shows a weak preferred orientation; the analyst recommends XRD for further identification. Field name was 'metamorphic schist'.",
    analyst_or_lab=LAB, report_date=DT))

# ---------------------------------------------------------------- 2
SF = "Petrographic descriptions 11.04.pdf"
FID = "1nIKqxM9CtQt3Hn62D0ExKWKdL-CAaVPq"
LAB = "Mireslab Mongol LLC (reported by Undarmaa); Report #005 / Order No 005; contact Batkhurel (Innova Mineral)"
DT = "2022-11-07"
recs.append(R(source_file=SF, source_fileId=FID, sample_id="OVF-1",
    sample_type="polished thin section (section no. OVF-1)",
    rock_name="Quartz vein (?) - quartz-carbonate vein",
    texture="Radial (spherulitic) quartz aggregates between carbonate aggregates; very fine to coarse carbonate",
    minerals=[{"mineral":"Quartz","pct":"55-65"},{"mineral":"Carbonate minerals","pct":"30-35"},
              {"mineral":"Hematite","pct":"rare"}],
    alteration="Carbonate partly replaced by Fe-oxide",
    opaque_minerals="Hematite - anhedral crowded aggregates between quartz and carbonate",
    description_summary="Pale white and green quartz-carbonate vein composed mainly of quartz and carbonate with minor hematite. Quartz forms radial (spherulitic) aggregates in the spaces between carbonate aggregates. Carbonate is partly replaced by Fe-oxide and ranges from very fine to coarse grained. Hematite occurs as anhedral crowded aggregates between quartz and carbonate.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="OVF-2",
    sample_type="polished thin section (section no. OVF-2)",
    rock_name="Red-brown quartzite hematite (hematitic quartzite)",
    texture="Massive; fine-grained (0.01-0.5 mm) anhedral quartz with sugar-like euhedral hematite",
    minerals=[{"mineral":"Quartz","pct":"35-45"},{"mineral":"Hematite","pct":"50-55"}],
    alteration=None,
    opaque_minerals="Hematite - bluish grey, euhedral 'sugar-like' crystals in crowded aggregates",
    description_summary="Reddish brown, massive hematitic quartzite made of quartz and hematite. Quartz is fine grained (0.01-0.5 mm), anhedral, and intergrown with euhedral sugar-textured hematite. Under reflected light hematite is bluish grey and forms crowded aggregates.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="020",
    sample_type="polished thin section (section no. 020)",
    rock_name="Dacite porphyry",
    texture="Porphyritic - 15-20% phenocrysts (tabular K-feldspar, isometric embayed quartz, prismatic plagioclase) in a felsic groundmass of 0.01-0.05 mm feldspar and quartz",
    minerals=[{"mineral":"Quartz","pct":"15-20"},{"mineral":"K-feldspar","pct":"20-30"},
              {"mineral":"Plagioclase","pct":"15-20"},{"mineral":"Mafic minerals","pct":"5"},
              {"mineral":"Sericite (secondary)","pct":None},{"mineral":"Clay minerals (secondary)","pct":None},
              {"mineral":"Chlorite (secondary)","pct":None},{"mineral":"Hematite","pct":"rare"},
              {"mineral":"Apatite","pct":"rare"}],
    alteration="Slight phyllic alteration - sericite + chlorite replacement with rare pyrite and hematite; incipient weathering produced clay minerals and Fe-oxide from feldspar breakdown; K-feldspar partly replaced by clay, Fe-oxide, sericite; biotite completely replaced by chlorite",
    opaque_minerals="Pyrite completely altered to hematite (bluish grey, cubic euhedral relict outlines)",
    description_summary="Pale reddish pink porphyritic dacite with 15-20% phenocrysts of tabular perthitic K-feldspar (2-3 mm), embayed isometric quartz (1-2 mm) and prismatic polysynthetically twinned plagioclase (0.5-2 mm) in a felsic groundmass. The rock has undergone weak phyllic alteration with sericite and chlorite, and incipient weathering has generated clay minerals and Fe-oxide. Biotite is entirely chloritised and pyrite is completely pseudomorphed by bluish-grey hematite that preserves cubic outlines.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="OV-40",
    sample_type="polished thin section (section no. OV-40)",
    rock_name="Intermediate (?) intrusive rock - entirely altered, name not determinable",
    texture="Medium grained; yellow-grey; relict feldspar outlines with oriented crowded chlorite aggregates",
    minerals=[{"mineral":"Feldspar","pct":"45-55"},{"mineral":"Sericite (alteration)","pct":None},
              {"mineral":"Clay minerals (alteration)","pct":None},{"mineral":"Chlorite (alteration)","pct":None},
              {"mineral":"Hematite","pct":"rare"},{"mineral":"Pyrite","pct":"rare"},
              {"mineral":"Goethite","pct":"rare"}],
    alteration="Intense - feldspars variously strongly altered to clay minerals and fine sericite flakes; chlorite as acicular crowded oriented aggregates with fine hematite along cleavage",
    opaque_minerals="Pyrite (yellow in reflected light, encloses euhedral quartz, partly replaced by hematite with cubic relict outline); hematite bluish grey subhedral, rimmed by goethite",
    description_summary="Yellow-grey medium-grained intrusive rock so strongly altered that the protolith name cannot be established. It consists of intensely altered feldspar, chlorite flakes and minor hematite and pyrite. Pyrite is variously replaced by hematite preserving cubic outlines, and hematite is in turn partly replaced by goethite at grain margins.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="OV-41",
    sample_type="polished thin section (section no. OV-41)",
    rock_name="Mafic intrusive rock",
    texture="Medium grained; prismatic plagioclase 1-2 mm with euhedral pyroxene relicts 1-2.5 mm",
    minerals=[{"mineral":"Plagioclase","pct":"45-55"},{"mineral":"Mafic minerals (pyroxene)","pct":"25-30"},
              {"mineral":"Sericite (alteration)","pct":None},{"mineral":"Chlorite (alteration)","pct":None},
              {"mineral":"Clay minerals (alteration)","pct":None},{"mineral":"Carbonate (alteration)","pct":None},
              {"mineral":"Hematite","pct":"rare"},{"mineral":"Pyrite","pct":"rare"},
              {"mineral":"Magnetite","pct":"rare"},{"mineral":"Apatite","pct":"rare"}],
    alteration="Intense; strongly weathered and impregnated by iron oxide. Plagioclase moderately altered to sericite and clay; pyroxene entirely replaced by chlorite, fine carbonate and elongate specularite",
    opaque_minerals="Magnetite (brownish grey, fine disseminated, in fractures of altered pyroxene); hematite (bluish grey, completely replaces primary magnetite, plus elongate specularite 0.02-0.05 mm in pyroxene cleavage); pyrite (white-yellow subhedral, <=0.1 mm, locally altered to goethite)",
    description_summary="Yellow-grey medium-grained mafic intrusive rock composed of intensely altered plagioclase and mafic minerals, strongly weathered and impregnated with iron oxide. Euhedral pyroxene relicts (1-2.5 mm) are completely replaced by chlorite, fine carbonate and elongate hematite (specularite). Disseminated brownish-grey magnetite is replaced by bluish-grey hematite, and subhedral pyrite is locally altered to goethite. Apatite occurs as narrow elongate prisms 0.1-0.2 mm.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="OV-51",
    sample_type="polished thin section (section no. OV-51)",
    rock_name="Moderately altered dolerite",
    texture="Intergranular; un-oriented prismatic euhedral plagioclase 0.5-1 mm with 0.1-0.5 mm altered mafic minerals between",
    minerals=[{"mineral":"Plagioclase","pct":"35-45"},{"mineral":"Mafic minerals","pct":"25-30"},
              {"mineral":"Quartz","pct":"rare"},{"mineral":"Sericite (alteration)","pct":None},
              {"mineral":"Clay minerals (alteration)","pct":None},{"mineral":"Chlorite (alteration)","pct":None},
              {"mineral":"Carbonate (alteration)","pct":None},{"mineral":"Apatite","pct":"a few"},
              {"mineral":"Pyrite","pct":"a few"},{"mineral":"Hematite","pct":"rare"},
              {"mineral":"Magnetite","pct":"rare"},{"mineral":"Ilmenite","pct":"rare"}],
    alteration="Moderate phyllic - sericite (0.01-0.05 mm flakes/needles) in plagioclase, chlorite radial and crowded flakes plus carbonate replacing mafic minerals",
    opaque_minerals="Pyrite (cubic, disseminated, partly replaced by hematite); hematite (white-grey fine flakes in narrow fractures); magnetite (euhedral cubic 0.025-0.01 mm crowded aggregates enclosing pyrite and quartz, locally replaced by hematite); ilmenite (brownish grey, euhedral, very fine, irregular)",
    description_summary="Brown-yellow-grey fine-grained dolerite with intergranular texture, composed of prismatic plagioclase (0.5-1 mm, polysynthetically twinned) and completely altered mafic minerals, with apatite and pyrite as accessories. Alteration is moderate phyllic: sericite and clay in plagioclase, radial chlorite plus carbonate replacing the mafic phases, which are inferred to have been pyroxene from their association with fine magnetite. Opaques include cubic pyrite partly replaced by hematite, crowded euhedral magnetite locally martitised, and trace euhedral ilmenite.",
    analyst_or_lab=LAB, report_date=DT))

# ---------------------------------------------------------------- 3
SF = "Report_0715_Ni.pdf"
FID = "1jIT5VpacpQcvW1KbUty6C1EmT2PPr1Fu"
LAB = "Mireslab Mongol LLC - Jamsran Erdenebayar; Report #004 / Order No 002; report to Innova Mineral, contact Batkhurel. Sections prepared at Dept. of Geology & Hydrogeology, MUST; XRD at MiReS Lab Japan; SEM-EDS (JEOL JSM 5400 + Oxford EDS) at Akita University"
DT = "2022-07-15"
recs.append(R(source_file=SF, source_fileId=FID, sample_id="2111",
    sample_type="polished thin section (2 per sample) + powder for XRD + SEM-EDS",
    rock_name="Hematite ore",
    rock_name_original=None,
    texture="Two generations of hematite: well-crystallised, highly cataclased grains, and rounded residual crystals in goethite; colloform banding, spherulitic texture and specularite",
    minerals=[{"mineral":"Hematite (Fe2O3, XRD)","pct":None},{"mineral":"Goethite (FeO(OH), XRD)","pct":None},
              {"mineral":"Trevorite? Ni(Fe2O4) (XRD)","pct":None}],
    alteration="Supergene oxidation - hematite replaced/rimmed by goethite",
    opaque_minerals="Hematite (grey-white with faint bluish tint, distinct anisotropy), goethite (blackish grey, <50 um, anhedral, weak pleochroism, moderate reflectance)",
    description_summary="Hematite ore in which hematite occurs in two generations: a first generation of well-crystallised, highly cataclased grains with sharp contacts against goethite, and a second generation of rounded residual crystals enclosed in goethite mineralisation. Colloform banding, spherulitic texture and specularite are developed. XRD identified hematite, goethite and possible trevorite (NiFe2O4); SEM-EDS gave a goethite analysis (Fe 77.8 wt%) and two Ni-Cu-bearing Fe-oxide spots (Ni 2.84 and 2.25 wt%, Cu 1.19 and 1.22 wt%) interpreted as possible trevorite.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="2107",
    sample_type="polished thin section (2 per sample) + powder for XRD + SEM-EDS",
    rock_name=None,
    texture="Anhedral pyrite as dense assemblage of fine-grained particles occurring as micro-cracked inlays",
    minerals=[{"mineral":"Nimite-1MIIb (Ni,Mg,Al)6(Si,Al)4O10 (XRD)","pct":None},
              {"mineral":"Ferriwinchite (XRD)","pct":None},{"mineral":"Poitevinite Cu(SO4)(H2O) (XRD)","pct":None},
              {"mineral":"Chromite Cr2O3.NiO (XRD)","pct":None},{"mineral":"Azurite (XRD)","pct":None},
              {"mineral":"Chlorite-serpentine (XRD)","pct":None},{"mineral":"Talc (XRD)","pct":None},
              {"mineral":"Pyrite (XRD)","pct":None},{"mineral":"Hematite (XRD)","pct":None},
              {"mineral":"Goethite (XRD)","pct":None}],
    alteration="Oxidation - pyrite corroded by goethite; hematite the main ore phase with goethite secondary",
    opaque_minerals="Hematite (grey to silver-grey with red internal reflection, main ore mineral), goethite (secondary), pyrite (whitish-yellow, isometric/polygonal, anhedral, corroded by goethite)",
    description_summary="Polished sections examined under ore microscope show hematite as the dominant ore mineral with goethite as the secondary phase; hematite is grey to silver-grey with red internal reflection and is partly eroded by non-ore minerals. Anhedral pyrite forms dense fine-grained assemblages as micro-cracked inlays and is corroded by goethite. XRD of this sample returned a Ni-bearing assemblage including nimite, chromite (Cr2O3.NiO), chlorite-serpentine, talc, azurite, poitevinite, pyrite, hematite and goethite; SEM-EDS spots gave Ni 11.97 wt% / Cu 7.90 wt% in a Mg-Si-Ca silicate and Ni 1.20 wt% / Cu 1.05 wt% in chromite.",
    analyst_or_lab=LAB, report_date=DT))

# ---------------------------------------------------------------- 4
SF = "Report_microscope_20221012.pdf"
FID = "1sBdqf9GC7ZO_690r9rE2R6QhJe2cq54t"
LAB = "Mireslab Mongol LLC (Миреслаб Монгол) - Ж. Эрдэнэбаяр (J. Erdenebayar); Report #004 / Order #003; contact B. Batkhurel (Innova Mineral). Sections prepared at Geological Central Laboratory (from 3 Aug 2022); microscopy at MUST Mineral Resources & Geoinformation Centre on Nikon Eclipse LV100-POL; XRD at Akita, Japan"
DT = "2022-10-12"
recs.append(R(source_file=SF, source_fileId=FID, sample_id="YM-29",
    sample_type="polished thin section (davhar ongolson shlif) - petrography",
    rock_name="Intermediate subvolcanic rock (intermediate subvolcanic / dyke-type intrusive)",
    rock_name_original="Дундлаг найрлагатай субвулкан",
    texture="Структур: порфир маягийн (porphyritic); crystal size 0.5-3 mm",
    minerals=[{"mineral":"Плагиоклаз / plagioclase","pct":"50-70"},{"mineral":"Хлорит / chlorite (secondary)","pct":None},
              {"mineral":"Актинолит / actinolite (secondary)","pct":None},{"mineral":"Эпидот / epidote (secondary)","pct":None},
              {"mineral":"Мусковит / muscovite (secondary)","pct":None},{"mineral":"Карбонат / carbonate (secondary)","pct":None}],
    alteration="Intense: mafic minerals strongly replaced by chlorite, feldspars replaced by sericite (locally coarsened to muscovite); epidote-chlorite +/- carbonate aggregates; weakly cut by fractures",
    opaque_minerals=None,
    description_summary="Эрчимтэй хувирсан, үндсэн хэсгийн дийлэнхийг плагиоклаз эзэлдэг чулуулаг. Плагиоклаз нь призмлэг идиоморф, урт тэнхлэгийн дагуу 0.5-3 мм, полисинтет ихэрлэлттэй боловч шаврын эрдэс, серицитэд түрэгдсэнээр ихэрлэлт нь сул ажиглагдана; зарим талстад серицит томорч мусковит болжээ. Хоёрдогч эрдсүүд нь актинолит (урт нарийхан, өнгөгүй, тод спайност) ба эпидот-хлоритын цацраг агрегат, заримдаа карбонаттай эвшсэн. Анхдагч чулуулаг нь дундлаг найрлагатай субвулкан буюу дайкийн төрлийн интрузив байсан бололтой.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="YM-27",
    sample_type="polished thin section - petrography",
    rock_name="Andesite porphyry (fine-grained diorite)",
    rock_name_original="андезит порфир (жижиг мөхлөгтэй диорит)",
    texture="Crystal size 0.2-4 mm; long narrow prismatic plagioclase with simple twinning",
    minerals=[{"mineral":"Плагиоклаз / plagioclase (andesine No.32-35)","pct":"45-60"},
              {"mineral":"Кварц / quartz","pct":"15-20"},{"mineral":"Эпидот / epidote (secondary)","pct":None},
              {"mineral":"Карбонат / carbonate (secondary)","pct":None}],
    alteration="Weak - epidote and locally carbonate aggregates partly replace plagioclase; rock essentially unaffected by fracturing",
    opaque_minerals="Ore minerals scarce (хүдрийн эрдэс багатай)",
    description_summary="Сулхан хувирсан, дан плагиоклазаас бүрдэлтэй чулуулаг. Анхдагч голлох эрдэс нь 4 мм хүртэл урт нарийхан призмлэг плагиоклаз (андезин №32-35) бөгөөд зарим мөхлөгт энгийн ихэрлэлт тод илэрнэ. Хоёрдогч эрдэс болох хурц шаргал эпидотын үүсвэр, заримдаа карбонатын агрегат плагиоклазыг хэсэгчлэн түрсэн байна. Плагиоклазын мөхлөгүүдийн завсраар кварцын ксеноморф мөхлөгүүд тааралдах ба анхдагч үүсвэр биш бололтой. Чулуулаг нь хувирал болон хагарал ан цавд бараг өртөөгүй.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="YT-20",
    sample_type="polished thin section - petrography (printed as ҮТ-20 in Cyrillic; listed as YT-20 in the sample table)",
    rock_name="Amygdaloidal basalt / andesite-basalt",
    rock_name_original="Миндалекаменный базальт-андезитбазальт",
    texture="Структур: порфир, миндалекаменный (porphyritic, amygdaloidal); crystal size 0.05-2 mm",
    minerals=[{"mineral":"Плагиоклаз / plagioclase","pct":"35-45"},{"mineral":"Миндал / amygdules","pct":"20-25"},
              {"mineral":"Шаврын эрдэс / clay minerals","pct":None},{"mineral":"Мусковит-серицит / muscovite-sericite","pct":None},
              {"mineral":"Хлорит / chlorite","pct":None},{"mineral":"Карбонат / carbonate","pct":None},
              {"mineral":"Эпидот / epidote","pct":None},{"mineral":"Кварц / quartz","pct":None},
              {"mineral":"Хүдрийн эрдэс / ore minerals","pct":None}],
    alteration="Intense: coloured minerals strongly replaced by chlorite, feldspars by sericite; amygdules completely filled by carbonate aggregate and fine crystalline quartz; weakly fracture-cut",
    opaque_minerals="Гематит, гётит (hematite, goethite); square/tabular fine ore-mineral grains and clots in the groundmass; local fully oxidised red iron-oxide clots",
    description_summary="Эрчимтэй хувирсан вулканоген чулуулаг. Анхдагч шигтгээ (плагиоклаз ба өнгөт эрдсийн реликт хэлбэрүүд) ба миндалууд нь харилцан адилгүй найрлагатай эрдсээр дүүргэгдсэн бөгөөд ихэвчлэн кварцын хавтгай ксеноморф талстууд үүссэн. Хөвөө хэсгээр хээрийн жоншны ксеноморф талст, төв хэсгээр кварц, эпидот, төмрөөр баялаг хлорит үүссэн ба миндалин нь бор саарал карбонатын агрегат ба жижиг талстлаг кварцаар бүрэн түрэгдсэн. Үндсэн хэсэг нь маш жижиг микролит плагиоклаз, хүдрийн эрдсийн жижиг ширхэг ба карбонатлаг агрегатаас бүрдэнэ; хүдрийн эрдсээс гематит, гётит тохиолдоно.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="YT-21",
    sample_type="polished thin section - petrography (printed as ҮТ-21)",
    rock_name="Basalt / andesite-basalt (altered volcanic)",
    rock_name_original="базальт- андезитбазальт",
    texture="Структур: гипидиоморф мөхлөгт (hypidiomorphic granular); crystal size 2-10 mm",
    minerals=[{"mineral":"Плагиоклаз / plagioclase","pct":"40-55"},{"mineral":"Амфибол / amphibole (relict)","pct":"20-25"},
              {"mineral":"Кварц / quartz (secondary)","pct":"15-20"},{"mineral":"Хлорит+карбонат / chlorite+carbonate","pct":None},
              {"mineral":"Магнетит / magnetite (ore minerals)","pct":">10"}],
    alteration="Plagioclase partly sericitised and carbonatised; amphibole relicts (0.5-1 mm prisms) completely replaced by chlorite-carbonate aggregate and iron oxide; groundmass intensely carbonatised",
    opaque_minerals="Магнетит (magnetite) - square and irregular grains, ore minerals about 10%+",
    description_summary="Хувирсан вулканит. Анхдагч эрдэс нь 3 мм хүртэл урт нарийхан шигтгээ плагиоклаз (дундлаг-суурилаг эгнээ), хэсэгчлэн серицитжиж карбонатжсан, мөн хлорит+карбонатлаг агрегатаар бүрэн түрэгдсэн 0.5-1 мм-ийн призмлэг амфиболын реликт мөхлөгүүд (чулуулгийн 20-25%). Үндсэн хэсэг нь эрчимтэй карбонатжсан плагиоклазын харьцангуй жижиг мөхлөг, бүрэн түрэгдсэн өнгөт эрдсийн реликт, хоёрдогч кварц, карбонат ба магнетитын квадрат хэлбэрийн ширхэгүүдээс бүрдэнэ. Хүдрийн эрдэс ойролцоогоор 10 гаруй хувийг эзэлнэ.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="YT-40",
    sample_type="polished thin section - petrography (printed as ҮТ-40)",
    rock_name="Tuffite / tuffaceous sandstone; andesitic tuff with 2-8 mm rhyolite and andesite lithic clasts",
    rock_name_original="туффит, туфоэлсжин",
    texture="Структур: порфир (porphyritic); clast/crystal size 0.03-8 mm; poorly rounded, unsorted",
    minerals=[{"mineral":"Чулуулгийн хэмхтэс / lithic clasts","pct":"30-45"},
              {"mineral":"Плагиоклаз / plagioclase","pct":"25-30"},{"mineral":"Кварц / quartz","pct":"10-15"},
              {"mineral":"Мусковит / muscovite","pct":None},{"mineral":"Серицит / sericite","pct":None},
              {"mineral":"Карбонат / carbonate","pct":None},{"mineral":"Эпидот / epidote","pct":None}],
    alteration="Carbonate and epidote widely distributed in the dark ore-rich cement",
    opaque_minerals="Dark ore-rich (хүдэрлэг) cement matrix with weak preferred orientation",
    description_summary="Тунамал, жижиг ширхэгтэй хэмхдэслэг чулуулаг. Хэмхлэс материал нь голдуу дундлаг вулканит, плагиоклаз ба кварцын бутархай, 2.2 мм хүртэл кварцит маягийн фельзитлэг агрегатлаг кварц зэрэг вулканоген тунамал чулуулаг, эрдсийн холимог бөгөөд мөлгөршилт сул, сортлолт байхгүй. Барьцалдуулагч материал нь хар бараан хүдэрлэг масс, бүдэг чиглэлтэй тархалттай, карбонат, эпидот их тархалттай. Риолит болон андезитын 2-8 мм хэмжээтэй хэмхдэс агуулсан андезит туф нь порфир структуртай ба үндсэн хэсэг нь бараан галт уулын шил, амфибол, багаар хээрийн жоншны ксеноморф талстаас бүрдэнэ.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="YT-38",
    sample_type="polished thin section - petrography + mineragraphy + XRD",
    rock_name="Andesite porphyry; ore: hematite-goethite-limonite low-grade ore",
    rock_name_original="андезит порфир; Хүдэр: Гематит-гётит-лимонит ядуу хүдэр",
    texture="Структур: плагиопорфир; crystal size 0.2-4 mm. Ore texture: parallel, corrosion; ore grain size 0.01-4.8 mm",
    minerals=[{"mineral":"Плагиоклаз / plagioclase (andesine No.32-35, oligoclase-andesine)","pct":"45-60"},
              {"mineral":"Кварц / quartz","pct":"15-20"},{"mineral":"Серицит / sericite (secondary)","pct":None},
              {"mineral":"Карбонат / carbonate (secondary)","pct":None},
              {"mineral":"Гематит / hematite","pct":"5"},{"mineral":"Гётит / goethite","pct":"2"}],
    alteration="Uniform sericitisation of plagioclase; oxidation of iron minerals reddens the rock; XRD: quartz, illite-2M2, calcite, goethite, labradorite, albite",
    opaque_minerals="Гематит 5% (white, tabular, anisotropic, brown-blue extinction, 0.01x0.1 to 0.04x0.2 mm; probably after pyrite); гётит 2% + лимонит as goethite-limonite pseudomorphs preserving tabular, rectangular, hexagonal and rhombohedral outlines of a precursor (probably pyrite), 0.005x0.005 to 0.11x0.65 mm",
    description_summary="Дундлаг вулканит. Чулуулгийг суб-параллель байршилтай, серицитжиж хувирсан дундлаг эгнээний плагиоклазын жигдхэн 0.1-0.2 мм урттай мөхлөгүүд бүрдүүлнэ; плагиоклазын завсраар кварцын жижиг ксеноморф мөхлөг (хоёрдогч гаралтай ч байж болох) үүссэн. Төмөрлөг эрдсийн талст ба агрегат үүсвэр, тэдгээрийн исэлдлээс чулуулаг улаан өнгөтэй болсон. Минераграфийн хувьд гематит (5%) давамгайлж, гётит (2%) ба лимонит бага хэмжээтэй; гётит-лимонитийн псевдоморфоз нь анхдагч эрдсийн (магадгүй пирит) хавтанлаг, гексагон, ромбоэдр хэлбэрийг сайн хадгалж, хүдрийн бус эрдсээр хэсэгчлэн коррозилогдсон. XRD-ээр кварц, иллит-2M2, кальцит, гётит, лабрадорит, альбит тогтоогдов.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="YT-08",
    sample_type="polished thin section - petrography + mineragraphy + XRD (printed as ҮТ-08 / YT08)",
    rock_name="Rhyodacite (acid volcanic); ore: hematite-pyrite disseminated ore",
    rock_name_original="Риодацит; Хүдэр: гематит-пиритийн шигтгээлэг хүдэр",
    texture="Структур: порфир; crystal size 0.5-3 mm. Ore texture: corrosion, disseminated; ore grain size 0.001-2.0 mm",
    minerals=[{"mineral":"Плагиоклаз / plagioclase (acid)","pct":"5-10 (phenocrysts); 70-80 as microlites"},
              {"mineral":"Кварц / quartz","pct":"25-30"},{"mineral":"Хувирсан биотит / altered biotite","pct":"~5"},
              {"mineral":"Хлорит / chlorite (secondary)","pct":None},{"mineral":"Серицит / sericite (secondary)","pct":None},
              {"mineral":"Циркон / zircon (accessory)","pct":None},
              {"mineral":"Гематит / hematite","pct":"10-15"},{"mineral":"Пирит / pyrite","pct":"5"}],
    alteration="Weak-moderate sericitisation of plagioclase; chlorite after biotite; red iron hydroxide accumulated in former phenocryst sites; XRD: quartz, labradorite, chlorite IIb-4, biotite, actinolite, hematite, pyrite",
    opaque_minerals="Гематит 10-15% (silvery grey, isotropic, rare; mostly slightly replaced by grey-white goethite, preserving tabular/rectangular/hexagonal/rhombohedral outlines; 0.01x0.01 to 0.46x0.56 mm; locally formed after pyrite); Пирит 5% (pale yellow, sharp wavy boundaries, corroded and rimmed by secondary ore minerals; 0.01x0.02 up to 4.1x5.6 mm blotchy aggregates)",
    description_summary="Хүчиллэг вулканит. Чулуулгийн 70-80%-ийг хүчиллэг плагиоклазын нарийхан зүүлэг микролит, 20-30%-ийг кварцын жижиг агрегатлаг болон шигтгээ үүсвэрүүд эзэлнэ. Фенокристаллаар идиоморф призмлэг, полисинтет ихэрлэлттэй плагиоклазын 1-3 мм талстууд тохиолдох ба серицитэд жигд дунд зэрэг хувирсан. Кварц юм уу плагиоклазын томхон шигтгээ байсан зайд улаан төмрийн усан исэл хуримтлагдаж толболог ялгарал үүсгэжээ. Минераграфаар гематит (10-15%) давамгайлж, пирит (5%) хүдрийн хоёрдогч эрдсээр коррозилогдож 4.1х5.6 мм хүртэл толболог агрегат үүсгэнэ.",
    analyst_or_lab=LAB, report_date=DT))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="2022-01",
    sample_type="polished section (аншлиф) - mineragraphy + XRD only",
    rock_name="Hematite-goethite-hydrogoethite ore",
    rock_name_original="Гематит-гётит-гидрогётитийн хүдэр",
    texture="Структур/текстур: коррози, шигтгээлэг, судлархаг (corrosion, disseminated, veined); ore grain size 0.005-1.1 mm",
    minerals=[{"mineral":"Гематит / hematite","pct":"60-70"},{"mineral":"Гётит / goethite","pct":"20-30"},
              {"mineral":"Гидрогётит / hydrogoethite","pct":"minor"}],
    alteration="Supergene oxidation; XRD (sample 2022-01): goethite + hematite only",
    opaque_minerals="Гематит (white, tabular, anisotropic, brown-blue extinction, forming radial aggregates in fractures, 0.01x0.1 to 0.04x0.2 mm); гётит-лимонитийн псевдоморфоз (grey-white with red internal reflection, partly corroded by gangue, clotted aggregates, 0.005x0.005 to 0.11x0.65 mm)",
    description_summary="Гематит-гётит-гидрогётитийн хүдэр. Хүдрийн эрдсүүдэд гематит (60-70%) болон гётит (20-30%) давамгайлж, бага хэмжээгээр гидрогётит тохиолдоно. Гематит нь цагаан өнгөтэй, хавтанлаг, анизотроп, борхүрэн хөхөвтөр унтралттай ба голдуу ан цавуудад цацраг маягийн агрегат үүсгэжээ. Гётит-лимонитийн псевдоморфоз нь улаан дотоод рефлекстэй, хүдрийн бус эрдсээр хэсэгчлэн коррозилогдож бөөгнөрсөн агрегат үүсгэнэ. XRD-ээр зөвхөн гётит ба гематит тогтоогдсон.",
    analyst_or_lab=LAB, report_date=DT))

# ---------------------------------------------------------------- 5
SF = "MINERALOGICAL-DESCRIPTIONS_2023.03.25.pdf"
FID = "1PqskoIsimAuRzmS2h6uQeKGz1cv2ZHoq"
recs.append(R(source_file=SF, source_fileId=FID, sample_id="2023Nisample",
    sample_type="polished thin section + powder (XRD) + SEM-EDS",
    rock_name="Supergene Ni ore - garnierite / nickeliferous goethite-limonite in fractures",
    texture="Colloform garnierite fracture fillings; amorphous green fillings with vertical gradation from whitish todorokite at base to grass-green garnierite upward; garnierite phenocryst-like bodies surrounded by chalcedony",
    minerals=[{"mineral":"Quartz, syn (XRD)","pct":None},{"mineral":"Garnierite (Ni,Mg)3Si2O5(OH)4 (XRD)","pct":None},
              {"mineral":"Goethite Fe2O3.H2O (XRD)","pct":None},{"mineral":"Montmorillonite-chlorite (XRD)","pct":None},
              {"mineral":"Todorokite Ca0.8(Mn4O8)(H2O)2 (XRD)","pct":None}],
    alteration="Supergene/lateritic weathering of serpentinised ultramafic rock; secondary Ni enrichment of pre-existing fracture fills by circulating Ni-bearing solutions",
    opaque_minerals="Goethite (blackish grey, <50 um, anhedral, weak pleochroism, anisotropic, moderate reflectance) with goethite exsolutions in garnierite",
    description_summary="Greenish supergene Ni sample in which most fractures are filled by colloform garnierite of homogeneous green colour, interpreted as a single mineralising episode. Other fractures filled by amorphous material show a vertical gradation over a few decimetres from whitish, nearly Ni-free todorokite at the base to grass-green garnierite above, attributed to secondary enrichment by circulating Ni-bearing solutions. XRD gave quartz, garnierite, goethite, montmorillonite-chlorite and todorokite; SEM-EDS spots returned up to 17.8 wt% Ni with 10.0 wt% Co and 9.9 wt% Cu in Mn-rich phases and 4.0 wt% Ni in a Si-Mn phase. Nickeliferous limonite/goethite makes up the major portion of the ore.",
    analyst_or_lab="Mireslab Mongol LLC - Jamsran Erdenebayar; Report #001 / Order No 001; contact Batkhurel. Sections prepared at MiReSLab Japan; XRD Rigaku SmartLab (MiReSLab Japan); SEM-EDS JEOL JSM 5400 + Oxford, Akita University",
    report_date="2023-03-15"))

# ---------------------------------------------------------------- 6-9  Thin and polish docs
MN_LAB = "not stated in document (Mongolian-language petrographic-mineragraphic description sheet, 'Петрографи, минераграфийн бичиглэл' format; filed under 31_From_Batkhurel/5. Laboratory/Thin and polish)"
SF = "Thin and polish-1.docx"; FID = "1DfMbUNC3_4pIxEMFYjDPUb3TQZ5WHzM2"
recs.append(R(source_file=SF, source_fileId=FID, sample_id="SH-14",
    sample_type="polished thin section (ӨТШлиф)",
    rock_name="Malachite-bearing iron oxide ore",
    rock_name_original="Малахиттай төмрийн ислийн хүдэр",
    texture="Структур: гранобласт, бүслүүрлэг. Текстур: судлархаг, линзлэг. Mineral grain size 0.003-0.5 mm",
    minerals=[{"mineral":"Гётит / goethite","pct":"65-70"},{"mineral":"Гидрогётит / hydrogoethite","pct":"20-25"},
              {"mineral":"Малахит / malachite","pct":"3-5"}],
    alteration="Oxidation; goethite replaced from margins by hydrogoethite along 0.01-0.3 mm discontinuous seams",
    opaque_minerals="Goethite-hydrogoethite (ore mineral paragenesis: goethite-hydrogoethite, malachite)",
    description_summary="Төмрийн ислийн эрдсээс зонхилон бүрдэх хүдэр. Нэвтэрсэн гэрэлд төмрийн ислүүд изотроп, хар өнгөтэй, зарим хэсэгтээ улаан хүрэн, 0.01-0.3 мм өргөнтэй судланцруудаар зүсэгдсэн. Ойсон гэрэлд гётит (бүдэг саарал, сулавтар бүслүүрлэг, цул масс) захаасаа гидрогётитоор түрэгдэн исэлдсэн; гидрогётит улбар шар-хүрэн дотоод рефлекстэй. Төмрийн ислийн масс нүх сүвэрхэг ба нүх сүвийн зах хэсгээр малахитын маш жижиг ширхэгт агрегат, 0.003-0.05 мм өргөнтэй линз, судланцар үүссэн. Микроскопоор никелийн эрдэс ажиглагдаагүй - никель нь төмрийн исэл дотор хольц байдлаар агуулагдсан байх магадлалтай (SEM-ээр нарийвчлах шаардлагатай).",
    analyst_or_lab=MN_LAB, report_date=None))

SF = "Thin and polish-1sh.docx"; FID = "1UiyI5UX26_xmf4BTJIIUTL2yWWZ-FGEa"
recs.append(R(source_file=SF, source_fileId=FID, sample_id="SH-18",
    sample_type="polished thin section (ӨТШлиф)",
    rock_name="Chlorite-albite metasomatite after diorite",
    rock_name_original="Диоритоор үүссэн хлорит-альбитат метасоматит",
    texture="Структур: микролепидогранобласт, реликт призмлэг мөхлөгт. Текстур: сулавтар занарлаг. Grain size 0.01-0.3 mm",
    minerals=[{"mineral":"Хувирсан плагиоклаз / altered plagioclase (albite)","pct":"45-50"},
              {"mineral":"Хлоритын псевдоморфоз / chlorite pseudomorphs","pct":"15-20"},
              {"mineral":"Магнетит / magnetite","pct":"ганц нэг (rare)"},
              {"mineral":"Титанит / titanite","pct":"цөөн (few)"},
              {"mineral":"Пирротин / pyrrhotite","pct":"ганц нэг (rare)"},
              {"mineral":"Альбит (эпигенет) / epigenetic albite","pct":None},
              {"mineral":"Кварц (эпигенет) / epigenetic quartz","pct":None},
              {"mineral":"Карбонат (эпигенет) / epigenetic carbonate","pct":None}],
    alteration="Very strong metasomatic alteration - protolith diorite texture only poorly preserved; plagioclase recrystallised to fine granoblastic albite; biotite/hornblende replaced by chlorite +/- muscovite pseudomorphs; late albite-quartz-carbonate veinlets 0.1-0.3 mm",
    opaque_minerals="Ore paragenesis magnetite - titanite - leucoxene - pyrrhotite - hydrogoethite. Magnetite isometric euhedral 0.01-0.08 mm, locally martitised; leucoxenised titanite (sphene) 0.05-0.1 mm; pyrrhotite pale yellow-grey 0.01-0.05 mm",
    description_summary="Сулавтар нэг зүг чиглэлтэй, хлорит-альбитаас тогтсон лепидогранобласт агрегатаас бүрдэх метасоматит. Анхдагч чулуу нь метасоматоз хувиралд маш хүчтэй хувирч реликт призмлэг мөхлөгт, бичил гипидиоморфлог бүтцээ муухан хадгалсан. Зонхилох хувийг 0.01-0.1 мм альбитын мөхлөгөөс тогтсон бичил гранобласт агрегат эзлэх ба реликт хавтгай призмлэг хэлбэр нь анхдагч плагиоклазын дахин талсжилтыг илтгэнэ. Тэдгээрийн завсраар 0.1-0.4 мм хэмжээтэй, бага зэрэг мусковиттай хлоритын псевдоморфозууд (анхдагч биотит/эвэрхуурмагаар үүссэн бололтой) жигд тархсан. Ойсон гэрэлд титанит, магнетит, пирротины бичил шигтгээ хлориттой ассоциациар үүссэн.",
    analyst_or_lab=MN_LAB, report_date=None))

SF = "Thin and polish-2sh.docx"; FID = "15hjIW8slda5_7rpK_Hkbvake7Qq7J0pW"
recs.append(R(source_file=SF, source_fileId=FID, sample_id="SH-14-1",
    sample_type="polished thin section (ӨТШлиф)",
    rock_name="Silicified actinolite-chlorite-clinozoisite-sericite metasomatite (after quartz diorite)",
    rock_name_original="Цахиуржсан актинолит-хлорит-циозит-серицитэт метасоматит (кварцат диоритоор үүссэн)",
    texture="Структур: микролепидогранобласт, реликт призмлэг мөхлөгт. Текстур: цул нягт. Grain size 0.01-0.3 mm",
    minerals=[{"mineral":"Эпидот-циозит-серицитэт агрегат (after plagioclase)","pct":"45-50"},
              {"mineral":"Хлорит / chlorite","pct":"15-20"},{"mineral":"Амфибол / amphibole","pct":"15-20"},
              {"mineral":"Кварц / quartz","pct":"10"},{"mineral":"Биотит / biotite","pct":"3-5"},
              {"mineral":"Актинолит / actinolite","pct":"3-5"},{"mineral":"Гётит / goethite","pct":"0.5-1.0"},
              {"mineral":"Гидрогётит / hydrogoethite","pct":"цөөн (few)"},
              {"mineral":"Магнетит / magnetite","pct":"ганц нэг (rare)"},
              {"mineral":"Гематит / hematite","pct":"цөөн (few)"},
              {"mineral":"Сфен / sphene","pct":"ганц нэг (rare)"},
              {"mineral":"Кварц (эпигенет) / epigenetic quartz","pct":"5"}],
    alteration="Very strong metasomatism - relict texture poorly preserved; plagioclase replaced by near-isotropic epidote-clinozoisite-sericite aggregate; hornblende pseudomorphed by chlorite-actinolite; cut by late quartz veinlets 0.1-0.5 mm",
    opaque_minerals="Ore paragenesis magnetite - hematite - goethite - hydrogoethite. Hematite isometric to prismatic 0.03-0.2 mm with relict magnetite inclusions; coarser zoned disseminated hematite/goethite grains 0.1-1.2 mm, some inside quartz veinlets; sphene 0.1-0.2 mm",
    description_summary="Эпидот-циозит-серицитэт агрегат ба тэдгээрийн завсраар үүссэн хлорит, актинолитоос тогтсон лепидогранобласт агрегатаас зонхилон бүрдэх метасоматит. Зонхилох хувийг эзлэх хагас изотроп эпидот-циозит-серицитэт агрегатын реликт хавтгай призмлэг хэлбэрээс үзвэл анхдагч плагиоклазаар үүссэн; завсар хооронд хлорит-актинолитоос тогтсон, эвэр хуурмагаар үүссэн бололтой псевдоморфозууд (0.1-0.3 мм) жигд тархсан. Изометрлэг кварцын мөхлөгүүд (0.1-0.2 мм) пойкилитоор хлорит, актинолит, эпидот агуулна. Ойсон гэрэлд гематит, гётит бичил шигтгээ байдлаар хлорит-актинолиттай ассоциациар үүссэн ба зарим гематит дотор магнетитын реликт ажиглагдана.",
    analyst_or_lab=MN_LAB, report_date=None))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="SH-16",
    sample_type="polished thin section (ӨТШлиф)",
    rock_name="Weakly carbonatised iron oxide ore",
    rock_name_original="Сулавтар карбонатчлагдсан төмрийн ислийн хүдэр",
    texture="Структур: микролепидогранобласт, реликт призмлэг мөхлөгт. Текстур: цул нягт. Grain size 0.01-0.3 mm",
    minerals=[{"mineral":"Гётит / goethite","pct":"70-75"},{"mineral":"Гидрогётит / hydrogoethite","pct":"20-25"},
              {"mineral":"Карбонат / carbonate","pct":"5-10"}],
    alteration="Oxidation (goethite -> hydrogoethite) plus weak carbonatisation; cut by fine carbonate lenses and veinlets 0.01-0.2 mm",
    opaque_minerals="Goethite-hydrogoethite (paragenesis goethite-hydrogoethite); goethite dull grey with weak zoning forming massive aggregate, hydrogoethite with orange-brown internal reflection",
    description_summary="Төмрийн ислийн эрдсээс зонхилон бүрдэх хүдэр. Нэвтэрсэн гэрэлд төмрийн ислүүд изотроп, хар, зарим хэсэгтээ улаан өнгөтэй, 0.01-0.2 мм өргөнтэй судланцруудаар зүсэгдсэн. Ойсон гэрэлд гётит нь бүдэг саарал, сулавтар бүслүүрлэг бүтэцтэй цул масс үүсгэх ба захаасаа 0.01-0.2 мм өргөнтэй гидрогётитоор түрэгдэн исэлдсэн. Төмрийн ислийн масс нь бичил ширхэгт карбонатаас тогтсон 0.01-0.2 мм өргөнтэй линз, судланцруудаар зүсэгдсэн байна.",
    analyst_or_lab=MN_LAB, report_date=None))

SF = "Thin and polish-4.docx"; FID = "1ip2bAQRB303SZq0R5zbY0CBuhQnA02cs"
recs.append(R(source_file=SF, source_fileId=FID, sample_id="2107",
    sample_type="polished thin section (ӨТШлиф)",
    rock_name="Amphibolite after gabbro (medium-grained)",
    rock_name_original="Габброгоор үүссэн амфиболит",
    texture="Структур: нематобластлаг, реликт гипидиоморфлог. Текстур: цул нягт. Grain size 1.0-5.0 mm",
    minerals=[{"mineral":"Эвэр хуурмаг / hornblende","pct":"80-85"},
              {"mineral":"Хлорит / chlorite (secondary)","pct":"5-10"},
              {"mineral":"Актинолит / actinolite (secondary)","pct":"10-15"},
              {"mineral":"Ильменит / ilmenite","pct":"цөөн (few)"},
              {"mineral":"Гётит / goethite","pct":"цөөн (few)"},
              {"mineral":"Гидрогётит / hydrogoethite","pct":"цөөн (few)"}],
    alteration="Hornblende replaced from margins by actinolite and chlorite; locally strongly replaced by actinolite-chlorite micronematolepidoblastic aggregate leaving hornblende relicts; goethite micro-lenses and veinlets along cleavage colour the surroundings orange-brown",
    opaque_minerals="Ore paragenesis ilmenite - hematite. Ilmenite brownish-grey, tabular-prismatic 0.05-0.2 mm, anisotropic, disseminated, slightly replaced at margins by leucoxene and hydrogoethite",
    description_summary="Харьцангуй том ширхэгтэй, бараг дан ганц эвэр хуурмагаас бүрдэх амфиболит. Эвэр хуурмаг нь цайвар бор хүрэн өнгөтэй, хавтгай призмлэг, 1.0-5.0 мм, унтралын өнцөг 16-22 градус, захаасаа актинолит, хлоритод хувирсан. Реликт гипидиоморфлог бүтцээс үзвэл амфиболит нь габброгоор үүссэн байх магадлалтай. Хувирсан эвэр хуурмагийн мөхлөг дотор ильменит, гётит, гематит, гидрогётит цөөнөөр ялгарч, ильменит захаасаа лейкоксен, гидрогётитоор бага зэрэг түрэгдсэн байна.",
    analyst_or_lab=MN_LAB, report_date=None))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="2104-1",
    sample_type="polished thin section (ӨТШлиф)",
    rock_name="Amphibolite after gabbrodiorite porphyry (amphibolitised gabbrodiorite porphyry)",
    rock_name_original="Габбродиорит порфироор үүссэн амфиболит /амфиболжсон габбродиорит порфир/",
    texture="Структур: реликт шигтгээлэг, үндсэн хэсэг реликт призмлэг мөхлөгт, лепидонематобласт. Текстур: цул нягт. Phenocrysts 0.5-2.0 mm, groundmass 0.1-0.3 mm",
    minerals=[{"mineral":"Эвэр хуурмаг / hornblende","pct":"65-70"},
              {"mineral":"Серицит-актинолит-хлоритын псевдоморфоз (after plagioclase)","pct":"25-30"},
              {"mineral":"Актинолит / actinolite (secondary)","pct":"5-10"},
              {"mineral":"Ильменит / ilmenite","pct":"0.5-1.0"},
              {"mineral":"Гётит / goethite","pct":"цөөн (few)"},
              {"mineral":"Пирит / pyrite","pct":"цөөн (few)"},
              {"mineral":"Гидрогётит / hydrogoethite","pct":"цөөн (few)"},
              {"mineral":"Лейкоксен / leucoxene","pct":"цөөн (few)"}],
    alteration="Strong amphibolitisation - most of the rock converted to actinolite-hornblende nematoblastic aggregate; original plagioclase completely replaced by sericite-actinolite-chlorite pseudomorphs",
    opaque_minerals="Ore paragenesis ilmenite - pyrite - goethite - hydrogoethite - leucoxene. Ilmenite brownish grey, tabular-prismatic 0.03-0.2 mm, evenly disseminated, slightly replaced by leucoxene; pyrite white-yellow euhedral 0.02-0.2 mm in lenses, rimmed and replaced by goethite/hydrogoethite",
    description_summary="Эвэр хуурмагийн реликт шигтгээнүүд (30-35%) болон эвэр хуурмаг, серицит-актинолит-хлоритын псевдоморфозоос тогтсон үндсэн хэсгээс бүрдэнэ. Реликт бүтцээс үзвэл анхдагч чулуу нь габбродиорит порфир байсан бөгөөд хүчтэй амфиболжих хувирлын үр дүнд дийлэнх хэсэг нь актинолит-эвэр хуурмагаас тогтсон нематобласт агрегатад шилжсэн. Эвэр хуурмагийн реликт шигтгээ нь 0.5-2.0 мм, унтралын өнцөг 17-20 градус, захаасаа актинолит, хлоритод хувирсан. Ойсон гэрэлд ильменит, гётит, пирит, гидрогётит тодорхойлогдсон.",
    analyst_or_lab=MN_LAB, report_date=None))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="A",
    sample_type="polished thin section (ӨТШлиф)",
    rock_name="Fine- to medium-grained pyroxene-hornblende gabbro",
    rock_name_original="Жижиг-дунд ширхэгтэй пироксен эвэр хуурмагт габбро",
    texture="Структур: субофитлог. Текстур: цул нягт. Grain size 0.6-2.5 mm",
    minerals=[{"mineral":"Плагиоклаз + эвэр хуурмаг / plagioclase + hornblende","pct":"20-25"},
              {"mineral":"Мон. пироксен / monoclinic pyroxene","pct":"10-15"},
              {"mineral":"Хувирсан биотит / altered biotite","pct":"3-5"},
              {"mineral":"Ильменит / ilmenite","pct":"цөөн (few)"},
              {"mineral":"Гётит / goethite","pct":"цөөн (few)"},
              {"mineral":"Гидрогётит / hydrogoethite","pct":"цөөн (few)"}],
    alteration="Weak - plagioclase slightly altered to sericite, chlorite, actinolite; biotite completely converted to chlorite with rutile; hornblende and clinopyroxene unaltered",
    opaque_minerals="Ilmenite (brownish grey, tabular-prismatic 0.05-0.2 mm, anisotropic, disseminated, slightly replaced at margins by leucoxene and hydrogoethite); few goethite micro-grains 0.01-0.1 mm locally replacing ilmenite",
    description_summary="Субофитлог бүтэцтэй габбро. Плагиоклаз нь хавтгай призмлэг, бүслүүрлэг, андезины найрлагатай, 0.6-1.8 мм, серицит, хлорит, актинолитод бага зэрэг хувирсан ба захаасаа эвэр хуурмагаар түрэгдсэн. Плагиоклазын призмүүдийн завсрыг эвэр хуурмаг, мон. пироксен, хувирсан биотит дүүргэн субофитлог бүтэц үүсгэнэ. Эвэр хуурмаг (0.5-2.0 мм) хувираагүй, мон. пироксен (0.7-1.8 мм, унтралын өнцөг 36-38 градус) хувираагүй, хувирсан биотит (0.3-1.1 мм) рутилтэй хлоритод бүрэн хувирсан. Ойсон гэрэлд ильменит, гётит, гидрогётит тодорхойлогдов.",
    analyst_or_lab=MN_LAB, report_date=None))
recs.append(R(source_file=SF, source_fileId=FID, sample_id="2102",
    sample_type="polished thin section (ӨТШлиф)",
    rock_name="Chlorite-albite metasomatite after gabbrodiorite porphyry",
    rock_name_original="Габбродиорит порфироор үүссэн хлорит-альбитат метасоматит",
    texture="Структур: микролепидогранобласт, реликт шигтгээлэг, реликт призмлэг мөхлөгт. Текстур: сулавтар занарлаг. Grain size 0.01-0.4 mm",
    minerals=[{"mineral":"Хувирсан плагиоклаз (альбит) / altered plagioclase (albite)","pct":"45-50"},
              {"mineral":"Хлоритын псевдоморфоз / chlorite pseudomorphs","pct":"15-20"},
              {"mineral":"Титанит / titanite","pct":"0.5-1.0"},
              {"mineral":"Ильменит / ilmenite","pct":"цөөн (few)"},
              {"mineral":"Гётит / goethite","pct":"ганц нэг (rare)"},
              {"mineral":"Пирит / pyrite","pct":"цөөн (few)"},
              {"mineral":"Актинолит / actinolite (secondary)","pct":None}],
    alteration="Very strong metasomatism; plagioclase recrystallised to fine albite granoblastic aggregate; primary biotite replaced by chlorite pseudomorphs with weak ferruginisation",
    opaque_minerals="Ore paragenesis ilmenite - titanite - leucoxene - pyrite - goethite - hydrogoethite. Ilmenite isometric euhedral 0.01-0.05 mm strongly replaced by titanite and hydrogoethite; leucoxenised titanite (sphene) 0.05-0.1 mm evenly disseminated; rare pyrite 0.01-0.05 mm",
    description_summary="Хлорит-альбитаас тогтсон лепидогранобласт агрегатаас бүрдэх метасоматит; анхдагч чулуу нь метасоматоз хувиралд маш хүчтэй хувирч реликт шигтгээлэг, призмлэг мөхлөгт бүтцээ муухан хадгалсан. Зонхилох хувийг 0.01-0.1 мм альбитын мөхлөгөөс тогтсон бичил гранобласт агрегат эзэлнэ. Реликт плагиоклазаар үүссэн псевдоморфозын завсраар 0.1-0.4 мм хэмжээтэй, бага зэрэг мусковиттай хлоритын псевдоморфозууд (анхдагч габбродиоритын биотитоор үүссэн, дотор нь сулавтар төмөржсөн биотитын реликттэй) жигд тархсан бөгөөд эдгээр нь реликт шигтгээлэг бүтцийг үүсгэнэ. Ойсон гэрэлд титанит, ильменит, пирит тодорхойлогдов.",
    analyst_or_lab=MN_LAB, report_date=None))

path = os.path.join(OUT, "samples.json")
json.dump(recs, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("batch1 records:", len(recs))
