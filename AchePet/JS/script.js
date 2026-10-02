const cidadeBusca = document.getElementById("cidadeBusca");
const btnPerdi = document.getElementById("btnPerdi");
const btnEncontrei = document.getElementById("btnEncontrei");

function normalizarTexto(texto) {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buscarPorCidade(status) {
  const cidadeDigitada = normalizarTexto(cidadeBusca.value);

  if (cidadeDigitada === "") {
    alert("Digite uma cidade para realizar a busca.");
    return;
  }

  const animais = document.querySelectorAll(".pet-card");
  let encontrouAnimal = false;

  animais.forEach(function (animal) {
    const cidadeAnimal = animal.dataset.cidade
      ? normalizarTexto(animal.dataset.cidade)
      : "";

    const animalPerdido =
      animal.querySelector(".pet-status.lost") !== null;

    const animalEncontrado =
      animal.querySelector(".pet-status.found") !== null;

    let pertenceCategoria = false;

    if (status === "perdido" && animalPerdido) {
      pertenceCategoria = true;
    }

    if (status === "encontrado" && animalEncontrado) {
      pertenceCategoria = true;
    }

    const mesmaCidade = cidadeAnimal === cidadeDigitada;

    if (pertenceCategoria && mesmaCidade) {
      animal.style.display = "";
      encontrouAnimal = true;
    } else {
      animal.style.display = "none";
    }
  });

  if (!encontrouAnimal) {
    alert("Não encontramos animais nessa cidade.");
  }
}

btnPerdi.addEventListener("click", function () {
  buscarPorCidade("perdido");
});

btnEncontrei.addEventListener("click", function () {
  buscarPorCidade("encontrado");
});

cidadeBusca.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    buscarPorCidade("perdido");
  }
});