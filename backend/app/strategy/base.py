from abc import ABC, abstractmethod


class ScreeningStrategy(ABC):
    name = "base"
    version = "0.1"

    @abstractmethod
    def evaluate(self, prices: list[dict]) -> dict:
        raise NotImplementedError
