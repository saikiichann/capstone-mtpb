// Filipino version of src/data/faq.js, by entry id. Same `**bold**` marks.
// An entry missing here shows in English. When an English answer changes,
// change its line here too.

export const FAQ_CATEGORY_LABELS_FIL = {
  all: 'Lahat',
  payment: 'Bayad',
  clamp: 'Clamp',
  impound: 'Impound',
  release: 'Pag-release',
}

export const FAQ_ENTRIES_FIL = {
  // ---- Payment ----
  'pay-onsite': {
    question: 'Saan ako puwedeng magbayad ng paglabag nang personal?',
    answer:
      'Maaari kang pumunta sa opisina ng MTPB sa **Central Market, Santa Cruz, Manila, 1008 Metro Manila** para bayaran ang iyong paglabag. Dalhin ang detalye ng iyong paglabag, ang reference number (kung mayroon), at isang valid ID para sa beripikasyon at pagproseso.',
    linkLabel: 'Tingnan ang lokasyon at direksyon',
  },
  'pay-how': {
    question: 'Paano ko babayaran ang aking paglabag?',
    answer:
      'I-scan ang QR code na nakakabit sa clamp, saka i-tap ang **Magbayad Ngayon** sa detalye ng paglabag. Maaari kang magbayad online gamit ang **GCash**, o piliin ang **Magbayad sa Opisina** at bayaran ito sa opisina ng MTPB.',
  },
  'pay-account': {
    question: 'Kailangan ko ba ng account para makapagbayad?',
    answer:
      'Hindi. Pagka-tap ng Magbayad Ngayon, maaari mong piliin ang **Magbayad bilang guest** at tapusin ang bayad nang hindi nagpaparehistro. Kailangan lang ng account kung gusto mong maitabi ang iyong mga resibo at makita ang lahat ng iyong paglabag sa susunod.',
  },
  'pay-fee': {
    question: 'May dagdag bang bayad kapag nagbayad online?',
    answer:
      'Oo. May maliit na convenience fee ang GCash sa bawat transaksyon. Makikita ang eksaktong halaga kasama ng multa sa screen ng kumpirmasyon, kaya lagi mong makikita ang kabuuan bago ka magbayad.',
  },
  'pay-receipt': {
    question: 'Makakakuha ba ako ng isa pang kopya ng aking resibo?',
    answer:
      'Kung naglagay ka ng email sa pagbabayad, ipapadala sa iyo ang resibo ng MTPB pagkatapos mismo ng bayad. Maaari mo rin itong i-download sa page ng resibo bago ito isara. Kung nagbayad ka bilang **guest** nang walang email at naisara na ang page, kailangang humingi ng kopya sa opisina ng MTPB. Kung may account ka, nasa History → Payment History ang iyong mga resibo.',
  },
  'pay-not-reflected': {
    question: 'Nabawasan na ang pera ko pero hindi pa bayad ang lumalabas sa paglabag.',
    answer:
      'Maghintay sandali at buksan muli ang paglabag, dahil maaaring tumagal nang ilang minuto ang kumpirmasyon. Kapag natanggap na, lalabas itong **Bayad – bineberipika** hanggang maberipika ng MTPB staff. Kung hindi pa rin bayad ang lumalabas, pumunta sa opisina ng MTPB dala ang iyong **reference number** o kumpirmasyon mula sa GCash, at susuriin ng aming mga tauhan ang transaksyon.',
  },

  // ---- Clamp ----
  'clamp-what-to-do': {
    question: 'Ano ang dapat kong gawin kung na-clamp ang aking sasakyan?',
    answer:
      'I-scan ang QR code na nakakabit sa clamp gamit ang iyong cellphone. Ipapakita ng system ang detalye ng iyong paglabag, halaga ng multa, mga paraan ng pagbabayad, at mga hakbang para mabayaran ang paglabag.',
  },
  'clamp-why': {
    question: 'Bakit na-clamp ang aking sasakyan?',
    answer:
      'May naitalang paglabag sa parking o trapiko ang isang MTPB enforcer laban sa iyong sasakyan. Sa pag-scan ng QR code sa clamp, makikita mo ang paglabag, ang lokasyon, ang enforcer na nagtala, ang multa, at ang mga larawang kinuha sa lugar.',
  },
  'clamp-contest': {
    question: 'Ano ang dapat kong gawin kung gusto kong kuwestiyunin ang isang paglabag?',
    answer:
      'Kung sa tingin mo ay mali ang ibinigay na paglabag, maaari kang personal na pumunta sa opisina ng MTPB sa **Central Market, Santa Cruz, Manila, 1008 Metro Manila** at ipakita ang mga sumusuportang dokumento o ebidensya. Susuriin ng awtorisadong tauhan ng MTPB ang iyong alalahanin at bibigyan ka ng karagdagang tagubilin.',
  },
  'clamp-remove-self': {
    question: 'Puwede ko bang tanggalin ang clamp nang ako lang?',
    answer:
      'Hindi. Ang pagtanggal o pagsira sa clamp ay hiwalay na paglabag at may dagdag na multa bukod sa iyong kasalukuyang multa. Ang awtorisadong tauhan lang ng MTPB ang maaaring magtanggal nito.',
  },
  'clamp-qr-fails': {
    question: 'Ayaw ma-scan ng QR code sa clamp. Ano ang dapat kong gawin?',
    answer:
      'Linisin ang sticker at subukang muli sa mas maliwanag na lugar. Kung ayaw pa ring ma-scan, pumunta sa opisina ng MTPB dala ang iyong **plate number** at ang lokasyon ng iyong sasakyan, at hahanapin ng aming mga tauhan ang paglabag para sa iyo.',
  },

  // ---- Impound ----
  'impound-online': {
    question: 'Puwede ko bang bayaran online ang na-impound na sasakyan?',
    answer:
      'Hindi. Ang bayad para sa **na-impound na sasakyan** ay dapat iproseso nang personal sa opisina ng MTPB. Kailangang dumaan ang may-ari sa beripikasyon ng dokumento at proseso ng pag-release bago mailabas ang sasakyan.',
    linkLabel: 'Tingnan ang lokasyon at direksyon',
  },
  'impound-where': {
    question: 'Nasaan ang impound area?',
    answer:
      'Dinadala ang mga na-impound na sasakyan sa **Central Market Impounding area, Santa Cruz, Manila**. Ipinapakita ng mapa sa app na ito ang eksaktong lokasyon at maaari ka nitong bigyan ng direksyon.',
    linkLabel: 'Tingnan ito sa mapa',
  },
  'impound-belongings': {
    question: 'Ano ang mangyayari sa mga gamit sa loob ng aking sasakyan?',
    answer:
      'Kung naroon ka habang hinihila ang sasakyan, dalhin mo ang iyong mahahalagang gamit. Mananatili sa loob ng sasakyan sa impound area ang mga naiwang gamit, kaya mas mabuting kunin agad ang iyong sasakyan.',
  },

  // ---- Release ----
  'release-documents': {
    question: 'Anong mga dokumento ang dapat kong dalhin sa pagkuha ng na-release na sasakyan?',
    answer:
      'Dapat magdala ang may-ari ng valid ID na inisyu ng gobyerno, patunay ng pagmamay-ari o awtorisasyon, patunay ng bayad, at iba pang dokumentong hihingin ng tauhan ng MTPB sa proseso ng beripikasyon.',
  },
  'release-how': {
    question: 'Paano mare-release ang aking sasakyan pagkatapos magbayad?',
    answer:
      'Para sa **naka-clamp na sasakyan**, manatili sa tabi nito pagkatapos magbayad at hintayin ang enforcer na darating para tanggalin ang clamp. Para sa **na-impound na sasakyan**, pumunta sa opisina ng MTPB dala ang mga dokumentong nakalista sa itaas.',
  },
  'release-how-long': {
    question: 'Gaano katagal bago matanggal ang clamp pagkatapos kong magbayad?',
    answer:
      'Karaniwan ay mga **15 hanggang 20 minuto**. Aabisuhan ng iyong bayad ang MTPB na bayad na ang paglabag, at magpapadala sila ng enforcer para tanggalin ang clamp. Manatili sa tabi ng iyong sasakyan para madali ka nilang mahanap.',
  },
  'release-other-person': {
    question: 'Puwede bang ibang tao ang kumuha ng sasakyan para sa akin?',
    answer:
      'Oo, basta magpakita sila ng **authorization letter** na pirmado ng rehistradong may-ari, ID ng may-ari, at sarili nilang valid ID, kasama ang patunay ng pagmamay-ari at patunay ng bayad.',
  },
}
