


//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
 
//var $ = require('jquery');
var BigInteger = require('./lib/BigInteger');
var Peercoin = require('./lib/Peercoin');  
var Base58 = require('./lib/Base58'); 
var priv_key = "e47eaac6a5e0cb54c4ca0448f9bce8ba48ce3da3b6d998c5f89066db64301616";
var thing ="0425009f42704de1327c3290df619a309f7029ec5f39a62f1fc5be3f0c2ed6a5e47dd3ce11e32e027bf18179508d7dffdf00b96f91597097b4bd7125faa68dc845";
var zeroes = "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

function init() {
  $("#passphrase").on("input", passphraseChanged);
  
  passphraseChanged();
}

function passphraseChanged (evt) {
  var phraseSHA;
  if (!evt || evt.currentTarget.value === "") {
    phraseSHA = zeroes.substr(0,64);
  } else {
    phraseSHA = Peercoin.Crypto.SHA256(evt.currentTarget.value, null);
  }

  // show private key
  $(".pk").text(phraseSHA);

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
    var pubKey = getPublicKey(privateKeyBN);
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
  hashAndBytes.unshift(0x37);
  var versionAndRipe = Peercoin.Crypto.bytesToHex(hashAndBytes);
  var check = computeChecksum(versionAndRipe);
  $(".address-checksum").text(check.checksum);

  var address = Base58.encode(Peercoin.Crypto.hexToBytes(versionAndRipe + check.checksum));
  $(".public-address").text(address);

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


function fromHex(e) {
   return new BigInteger(e, 16)
}

function secp256k1() {
   var e = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F"),
   t = BigInteger.ZERO,
   n = fromHex("7"),
   r = fromHex("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"),
   i = BigInteger.ONE,
   s = new Peercoin.ECCurveFp(e, t, n),
   o = s.decodePointHex("0479BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8");
   return new Peercoin.X9ECParameters(s, o, r, i)
}



// private key converted to big number
function getPublicKey (bn) {
  var curve = secp256k1();
  var curvePt = curve.getG().multiply(bn);
  var x = curvePt.getX().toBigInteger();
  var y = curvePt.getY().toBigInteger();

  // returns x,y as big ints
  return {
    x: Peercoin.Crypto.bytesToHex(Peercoin.integerToBytes(x, 32)),
    y: Peercoin.Crypto.bytesToHex(Peercoin.integerToBytes(y, 32)),
    yParity: y.isEven() ? "even" : "odd"
  }
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


