


//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
//var $ = require('jquery');
var BigInteger = require('./lib/BigInteger');
var Peercoin = require('./lib/Peercoin');  
var Base58 = require('./lib/Base58'); 
var ECurve = require('./lib/ECurve'); 

var zeroes = "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

function init() {
  var p="correct horse battery staple";
  $("#passphrase").val(p);
  handleInp(Peercoin.Crypto.SHA256(p, null));
  
  $("#passphrase").on("input", passphraseChanged);
  
}

function passphraseChanged (evt) {
  var phraseSHA;
  if (!evt || evt.currentTarget.value === "") {
    phraseSHA = zeroes.substr(0,64);
  } else {
    phraseSHA = Peercoin.Crypto.SHA256(evt.currentTarget.value, null);
  }
  handleInp(phraseSHA);
}
function handleInp(phraseSHA){
    // show private key
  $(".pk").text(phraseSHA);

  $("#base6").text(BigInteger.fromByteArrayUnsigned(Peercoin.Crypto.hexToBytes(phraseSHA)).toRadix(6));
  
  //display private key things
  displayPrivateKey(phraseSHA);

  //display public key things (this will call public address things as well)
  displayPublicKeyAndAddress(phraseSHA);
}
// input is private key hex
function displayPublicKeyAndAddress (hx) {

  // convert to int
  var privateKeyBN = BigInteger.fromByteArrayUnsigned(Peercoin.Crypto.hexToBytes(hx));
  if (privateKeyBN > 0) {
    var pubKey = ECurve.getPublicKey(privateKeyBN);
    $(".public-x").addClass("hex-container");
    $(".public-y").addClass("hex-container");
    $(".public-x").text(pubKey.x.toString());
    $(".public-y").text(pubKey.y.toString());

    // unhide things from invalid key
    $(".public-y-even-odd").show();
    $("#parity-arrow").css("visibility", "visible");
    $(".public-key-x-lead").css("visibility", "visible");

    var pub_key;
    if (pubKey.yParity === "even") {
      $(".public-y-even-odd").text("is EVEN.");
      $(".public-y-even-odd").css("color", "forestgreen");
      $(".public-key-x-lead").text("02");
      $(".public-key-x-lead").css("background-color", "forestgreen");
      $("#parity-arrow").attr("class", "green");
      pub_key = "02";
    } else {
      $(".public-y-even-odd").text("is ODD.");
      $(".public-y-even-odd").css("color", "firebrick");
      $(".public-key-x-lead").text("03");
      $(".public-key-x-lead").css("background-color", "firebrick");
      $("#parity-arrow").attr("class", "red");
      pub_key = "03";
    }
    var pub_key_x = pubKey.x.toString();
    $(".public-key-x").text(pub_key_x);
    pub_key += pub_key_x;

    // display public address
    displayPublicAddress(pub_key);

  } else {
    // set up for when key is invalid
    $(".public-y-even-odd").hide();
    $("#parity-arrow").css("visibility", "hidden");
    $(".public-x").text("n/a");
    $(".public-y").text("n/a");

    $(".public-key-x-lead").text("N/");
    $(".public-key-x-lead").css("background-color", "white");
    $(".public-key-x").text("A");


    $(".ripe160.hex-padding").text("N/A");
    $(".ripe160.hex-middle").html("&nbsp;N/A");

    $(".address-checksum").text("");
    $(".public-address").text("N/A");
  }
}

function displayPublicAddress (hx) {
  var sha = Peercoin.Crypto.SHA256(Peercoin.Crypto.hexToBytes(hx), null);
  var hash160 = Peercoin.Crypto.RIPEMD160(Peercoin.Crypto.hexToBytes(sha), null);
  $(".ripe160").text(hash160);

  var hashAndBytes = Peercoin.Crypto.hexToBytes(hash160);
  hashAndBytes.unshift(Peercoin.Address.networkVersion);//Peercoin Public Address lead Hex value 
  var versionAndRipe = Peercoin.Crypto.bytesToHex(hashAndBytes);
  var check = computeChecksum(versionAndRipe);
  $(".address-checksum").text(check.checksum);

  var address = Base58.encode(Peercoin.Crypto.hexToBytes(versionAndRipe + check.checksum));
  $(".public-address").text(address);
  $("#qr").html('<img src="http://chart.apis.google.com/chart?cht=qr&chl='+address+'&chs=220x220" border="0" alt="Peercoin Address" />');
}

// input is private key hex
function displayPrivateKey (hx) {
  // show checksum
  var pkWIF = "B7" + hx + "01"; //compressionflag
  var check = computeChecksum(pkWIF);
  $(".checksum-pk").text(check.checksum);
  $("#non-checksum").text(check.nonChecksum);
  pkWIF += check.checksum;

  // show private wif
  var address = Base58.encode(Peercoin.Crypto.hexToBytes(pkWIF));
  $(".private-wif").text(address);
}
 
function computeChecksum (hx) {
  var firstSHA = Peercoin.Crypto.SHA256(Peercoin.Crypto.hexToBytes(hx));
  var secondSHA = Peercoin.Crypto.SHA256(Peercoin.Crypto.hexToBytes(firstSHA));
  return {
    checksum: secondSHA.substr(0,8).toUpperCase(),
    nonChecksum: secondSHA.substr(8,secondSHA.length).toUpperCase()
  };
}
 
$(document).ready(init);


